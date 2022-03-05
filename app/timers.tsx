import _ from "lodash";
import React from "react";
import * as ACT from "./act";
import { Dict, Option, Percent, Span, addEventListener } from "./util";
import { Database, Entry, Target, querySets } from "./db";

enum State {
  Active = "active",
  Cooldown = "cooldown",
}

interface Event {
  action: string;
  source: string;
  target: string;
  castAt: Date;
}

class ActionIcon {
  static readonly _cache: { [actionID: number]: string } = {};
  static _currentRequest: Option<number> = null;
  static _lastRequest = performance.now();

  static readonly API_ROOT = "https://xivapi.com";
  // Max 8 per second
  static readonly RATE = 1000 / 8;

  static get(actionID: number) {
    if (this._cache[actionID]) return this._cache[actionID];

    this.fetch(actionID);
  }

  static fetch(actionID: number) {
    if (
      this._currentRequest ||
      performance.now() - this._lastRequest < this.RATE
    )
      return;

    this._currentRequest = actionID;

    fetch(`${this.API_ROOT}/Action/${actionID}?columns=Icon`, {
      mode: "cors",
    })
      .then((res) => res.json())
      .then(({ Icon }) => {
        this._cache[actionID] = `${this.API_ROOT}/${Icon}`;
        this._currentRequest = null;
        this._lastRequest = performance.now();
      })
      .catch((_err) => {
        this._currentRequest = null;
        this._lastRequest = performance.now();
      });
  }
}

// Because we want to use these as keys in a `Map`, and because maps use strict
// comparison for keys, we have to keep a global store of them similar to how
// `Symbol("foo")` is different than `Symbol.for("foo")`. This feels a bit
// silly, but the only other solutions are keeping two nestings of maps for each
// key part or using the string representation and then having a function that
// parses the string back into a `TimerKey`.
class TimerKey {
  readonly actionID: number;
  readonly sourceID: string;

  static readonly store: { [key: string]: TimerKey } = {};

  static stringRepr(actionID: number, sourceID: string) {
    return `${actionID}|${sourceID}`;
  }

  static for(actionID: number, sourceID: string) {
    return (this.store[this.stringRepr(actionID, sourceID)] ??= new TimerKey(
      actionID,
      sourceID
    ));
  }

  constructor(actionID: number, sourceID: string) {
    this.actionID = actionID;
    this.sourceID = sourceID;
  }

  toString() {
    return TimerKey.stringRepr(this.actionID, this.sourceID);
  }
}

interface Timer {
  actionDetails: Entry;
  events: Event[];
}

interface TimerBarProps {
  time: Span;
  percentage: Percent;
  icon: string | undefined;
  job: string;
  state: State;
  dismiss: () => void;
  action: string;
  source: string;
  subText: Option<string>;
}

class TimerBar extends React.Component<TimerBarProps> {
  render() {
    // FFXIV's buff timers use ceil(), so we do the same for consistency
    const seconds = Math.ceil(this.props.time);
    const width = (this.props.percentage * 100).bound(0, 100).toFixed(2) + "%";
    const iconStyle = this.props.icon
      ? { backgroundImage: `url(${this.props.icon})` }
      : {};

    return (
      <li className={`row ${this.props.state} ${this.props.job}`}>
        <div className="bar fast" style={{ width: width }} />
        <div className="text-overlay">
          <div className="close" onClick={() => this.props.dismiss()}>
            &times;
          </div>
          <div className="stats">
            {seconds > 0 ? <span className="total">{seconds}s</span> : null}
          </div>
          <div className="info">
            <span className="icon" style={iconStyle}></span>
            <span className="character-name">
              {this.props.action}: {this.props.source}
            </span>
            {this.props.subText ? (
              <span className="subtext">{this.props.subText}</span>
            ) : null}
          </div>
        </div>
      </li>
    );
  }
}

interface TimersProps {
  database: Database;
  tracking: Map<TimerKey, Timer>;
  serverTime: Date;
  dismissRow: (_: TimerKey) => void;
}

interface TimersState {}

class Timers extends React.Component<TimersProps, TimersState> {
  render() {
    // Here we're traversing through a map of keys that correspond to a single
    // timer identified by the unique (action, source) tuple. The values are a
    // list of events within the last cooldown span. We're constructing a single
    // array of unsorted timers from that distilled data.
    const timers = Array.from(this.props.tracking).flatMap(([key, timer]) => {
      const { duration, cooldown, targeting, job } = timer.actionDetails;

      // XXX: We don't even do anything interesting here with the events, we
      // just take the last one. There's some world where we can color things
      // differently if you miss a buff, for example, but right now the
      // representation is a little confusing.
      const event = _.last(timer.events);
      if (event === undefined) return [];

      const elapsed = Date.diff(this.props.serverTime, event.castAt) / 1000;

      let state, time, percentage;

      if (elapsed < duration) {
        state = State.Active;
        time = Math.max(0, duration - elapsed);
        percentage = time / duration;
      } else if (elapsed < cooldown * 2) {
        state = State.Cooldown;
        time = Math.max(0, cooldown - elapsed);
        percentage = elapsed / cooldown;
      } else {
        // Arbitrarily hide cooldowns if they've been off for an entire cooldown
        // cycle.
        return [];
      }

      const subText =
        state === State.Active
          ? targeting !== Target.Many
            ? event.target
            : null
          : null;

      const icon = ActionIcon.get(key.actionID);

      return {
        key,
        state,
        time,
        percentage,
        icon,
        job,
        subText,
        ...event,
      };
    });

    type Timer = typeof timers[number];

    const ranking = [
      ({ state }: Timer) => (state === State.Active ? 0 : 1),
      ({ time }: Timer) => time,
      ({ key }: Timer) => key.actionID,
    ];

    return (
      <ul className="timers">
        {_.sortBy(timers, ...ranking).map(({ key, ...timer }) => (
          <TimerBar
            key={key.toString()}
            dismiss={() => this.props.dismissRow(key)}
            {...timer}
          />
        ))}
      </ul>
    );
  }
}

interface AppProps {
  env: {
    actionSets: string[];
    debug: boolean;
  };
}

interface AppState {
  serverTime: Date;
  lastClockUpdate: Option<number>;
  tracking: Map<TimerKey, Timer>;
}

class App extends React.Component<AppProps, AppState> {
  static STORAGE_KEY = "timers";
  static TIME_RESOLUTION = 50;
  database: Database;

  static env(query: Dict): AppProps["env"] {
    return {
      actionSets: query.sets?.split(",") ?? [],
      debug: "debug" in query,
    };
  }

  constructor(props: AppProps) {
    super(props);
    this.database = querySets(props.env.actionSets);
    this.state = {
      serverTime: new Date(0),
      lastClockUpdate: null,
      tracking: new Map(),
    };
  }

  componentDidMount() {
    addEventListener<ACT.LogLine>("onLogLine", (e) => this.onLogLine(e));
    addEventListener<ACT.StateUpdate>("onOverlayStateUpdate", (e) =>
      this.onOverlayStateUpdate(e)
    );

    // Because updates from the server are sometimes spotty, every time we do
    // change our time, we note what the local time is as well. This timer runs
    // constantly, pushing the clock forward by the difference in our local
    // time, which helps account for skew.
    setInterval(() => {
      if (this.state.lastClockUpdate) {
        const offset = performance.now() - this.state.lastClockUpdate;
        const simulatedTime = this.state.serverTime.add(offset);
        this.advanceTime(simulatedTime);
      }
    }, App.TIME_RESOLUTION);
  }

  advanceTime(now: Date) {
    // We only set a new now if it advances our clock enough
    if (Date.diff(now, this.state.serverTime) > App.TIME_RESOLUTION) {
      this.setState({ serverTime: now, lastClockUpdate: performance.now() });
    }
  }

  onOverlayStateUpdate(e: CustomEvent<ACT.StateUpdate>) {
    if (!e.detail.isLocked) {
      document.documentElement.classList.add("resizable");
    } else {
      document.documentElement.classList.remove("resizable");
    }
  }

  onCast(
    sourceID: string,
    sourceName: string,
    actionIDRaw: string,
    actionName: string,
    _targetID: string,
    targetName: string
  ) {
    const actionID = parseInt(actionIDRaw, 16);
    if (actionID in this.database) {
      const actionDetails = this.database[actionID];
      const { serverTime } = this.state;
      const payload = {
        source: sourceName,
        action: actionName,
        target: targetName,
        castAt: serverTime,
      };
      const key = TimerKey.for(actionID, sourceID);
      const tracking = this.state.tracking.update(key, (timer) => ({
        actionDetails,
        events: (timer?.events ?? [])
          // Since this is a new cast, we can evict anything that has been
          // around longer than the cooldown
          .filter(
            ({ castAt }) =>
              Date.diff(serverTime, castAt) < actionDetails.cooldown * 1000
          )
          .concat(payload),
      }));
      this.setState({ tracking });
    }
  }

  onLogLine(e: CustomEvent<ACT.LogLine>) {
    const [code, timestamp, ...message]: Array<string> = JSON.parse(e.detail);

    const now = new Date(timestamp);
    this.advanceTime(now);

    type handler = (...args: string[]) => void;

    if (code === "21" || code === "22") {
      // XXX: Typescript doesn't like my spread usage here. I think we could
      // more eagerly parse the line into a structure and pass that along. It
      // would be a good chance to parse the strings into numbers too.
      (this.onCast as handler)(...message);
    }
  }

  dismissRow(key: TimerKey) {
    this.setState({
      tracking: this.state.tracking.remove(key),
    });
  }

  render() {
    return (
      <Timers
        database={this.database}
        dismissRow={(key) => this.dismissRow(key)}
        serverTime={this.state.serverTime}
        tracking={this.state.tracking}
      />
    );
  }
}

export default App;
