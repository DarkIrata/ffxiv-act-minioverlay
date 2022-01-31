import _ from "lodash";
import React from "react";
import * as ACT from "./act";
import { LogData, Activity } from "./log-data";
import {
  Dict,
  Option,
  Percent,
  Span,
  addEventListener,
  fset,
  noBubble,
} from "./util";

const GCD = 2500;

const LIMIT_BREAK = "limit break";

interface Encounter {
  title: string;
  duration: Span;
  isActive: boolean;
  stats: {
    damage: {
      total: number;
      perSecond: number;
    };
    healing: {
      total: number;
      perSecond: number;
    };
    tanking: {
      total: number;
    };
    deaths: number;
    revives: number;
  };

  combatants: Array<Combatant>;
  source: Source;
}

interface Combatant {
  name: string;
  job: string;
  isSelf: boolean;
  stats: {
    damage: {
      total: number;
      perSecond: number;
      relative: Percent;
      max: string;
      crit: Percent;
      directHit: Percent;
      critDirectHit: Percent;
    };
    healing: {
      total: number;
      perSecond: number;
      relative: Percent;
      max: string;
      overheal: Percent;
      crit: Percent;
    };
    tanking: {
      total: number;
      relative: Percent;
    };
    uptime: {
      total: Span;
      relative: Percent;
    };
    deaths: number;
    revives: number;
  };
}

interface Source {
  playerName: string;
  logData: LogData;
  actData: ACT.DataUpdate;
}

interface IndexedEncounter extends Encounter {
  index: Option<number>;
}

enum View {
  Damage = "Damage",
  Healing = "Healing",
  Tanking = "Tanking",
  Uptime = "Uptime",
  Deaths = "Deaths",
  Revives = "Revives",
}

// When duration is 0, ACT sends the dps as the string "∞"
const parseRate = (s: string): number => {
  const n = parseFloat(s);
  if (Number.isNaN(n)) {
    return 0;
  } else {
    return n;
  }
};

const parsePercent = (s: string): number => {
  if (/^[0-9.]+%$/.test(s)) {
    return parseFloat(s.slice(0, -1)) / 100;
  } else {
    return parseFloat(s);
  }
};

const parseEncounter = (source: Source): Encounter => {
  const { playerName, logData, actData } = source;

  // This is different from the encounter's notion of duration because ACT
  // may be configured to trim out periods of inactivity.
  const duration = LogData.encounterDuration(logData);

  const combatants = _.flatMap(actData.Combatant, (combatant) => {
    const [name, isSelf] =
      combatant.name === ACT.YOU || combatant.name === playerName
        ? [playerName, true]
        : [combatant.name, false];

    const uptime = logData.activity[name]?.uptime ?? 0;

    // This gets rid of NPCs, but it also somewhat unfortunately gets rid of
    // pets. Pet names show up as "Pet (Owner)", so it would be possible to try
    // and parse the name and match against the owner. I'm not sure it's worth
    // it.
    if (combatant.Job === "") return [];

    return {
      name,
      job: combatant.Job.toLowerCase(),
      isSelf,
      stats: {
        damage: {
          total: parseInt(combatant.damage),
          perSecond: parseRate(combatant.encdps),
          relative: parsePercent(combatant["damage%"]),
          max: combatant.maxhit,
          crit: parsePercent(combatant["crithit%"]),
          directHit: parsePercent(combatant.DirectHitPct),
          critDirectHit: parsePercent(combatant.CritDirectHitPct),
        },
        healing: {
          total: parseInt(combatant.healed),
          perSecond: parseRate(combatant.enchps),
          relative: parsePercent(combatant["healed%"]),
          max: combatant.maxheal,
          overheal: parsePercent(combatant["OverHealPct"]),
          crit: parsePercent(combatant["critheal%"]),
        },
        tanking: {
          total: parseInt(combatant.damagetaken),
          relative:
            parseInt(combatant.damagetaken) /
            parseInt(actData.Encounter.damagetaken),
          parry: parsePercent(combatant.ParryPct),
          block: parsePercent(combatant.BlockPct),
        },
        uptime: {
          total: uptime,
          relative: Math.min(1, uptime / duration),
        },
        deaths: parseInt(combatant.deaths),
        revives: logData.activity[name]?.revives ?? 0,
      },
    };
  });

  return {
    title: actData.Encounter.title,
    duration,
    isActive: actData.isActive === "true",
    stats: {
      damage: {
        total: parseInt(actData.Encounter.damage),
        perSecond: parseRate(actData.Encounter.encdps),
      },
      healing: {
        total: parseInt(actData.Encounter.healed),
        perSecond: parseRate(actData.Encounter.enchps),
      },
      tanking: {
        total: parseInt(actData.Encounter.damagetaken),
      },
      deaths: parseInt(actData.Encounter.deaths),
      revives: _.sumBy(combatants, "stats.revives"),
    },

    combatants,
    source,
  };
};

const versions = (playerName: string) => [
  (entry: any): Option<Source> => {
    if ("Encounter" in entry) {
      const logData = entry.logData ?? null;
      return {
        actData: entry as ACT.DataUpdate,
        logData,
        playerName,
      };
    }

    return null;
  },
  (entry: any): Option<Source> => {
    if ("raw" in entry && "logData" in entry) {
      return {
        actData: entry.raw,
        logData: LogData.load(entry.logData),
        playerName,
      };
    }

    return null;
  },
  (entry: any): Option<Source> => {
    if ("actData" in entry && "logData" in entry && "playerName" in entry) {
      return {
        actData: entry.actData,
        logData: LogData.load(entry.logData),
        playerName: entry.playerName,
      };
    }

    return null;
  },
];

const reconstruct = (data: object, playerName: string): Encounter => {
  const result = versions(playerName).reduce(
    (found, upgrade) => (found !== null ? found : upgrade(data)),
    null as Option<Source>
  );

  if (result === null) {
    throw Error("Can't upgrade history object");
  } else {
    return parseEncounter(result);
  }
};

const formatEncounter = (enc: Encounter) =>
  `${enc.title} (${formatSpan(enc.duration)})`;

const formatNumber = (n: number) => {
  if (n >= 1000000) {
    return (n / 1000000).toFixed(2) + "M";
  } else if (n >= 1000) {
    return (n / 1000).toFixed(2) + "K";
  }

  return n.toFixed(2);
};

const formatPercent = (n: number) => `${(n * 100).toFixed(0)}%`;

const formatSpan = (ms: number) => {
  const seconds = ms / 1000;
  const min = Math.floor(seconds / 60);
  const sec = (Math.abs(seconds) % 60).toFixed(0);
  return `${min}:${("0" + sec).slice(-2)}`;
};

interface CombatantCompactProps {
  total: number;
  max: number;
  actor: string;
  isSelf: boolean;
  format: (_: number) => string;
  note?: string;
  extra: Array<string>;
  rank: number;
  characterName: string;
  job: string;
}

class CombatantCompact extends React.PureComponent<CombatantCompactProps> {
  render() {
    const percent = this.props.total / this.props.max;
    const width = Math.min(100, percent * 100) + "%";

    return (
      <li
        className={`row ${this.props.actor} ${this.props.isSelf ? "self" : ""}`}
      >
        <div className="bar" style={{ width: width }} />
        <div className="text-overlay">
          <div className="stats">
            <span className="total">{this.props.format(this.props.total)}</span>
            {this.props.note ? (
              <span className="note">[{this.props.note}]</span>
            ) : null}
            {this.props.extra.length > 0
              ? `(${this.props.extra.join(", ")})`
              : null}
          </div>
          <div className="info">
            <span className="icon job-icon"></span>
            <span className="rank">{this.props.rank}.</span>
            <span className="character-name">{this.props.characterName}</span>
            <span className="character-job">{this.props.job}</span>
          </div>
        </div>
      </li>
    );
  }
}

interface StatsProps {
  self: Combatant;
}

class Stats extends React.Component<StatsProps, {}> {
  render() {
    const { self } = this.props;

    const Stat: React.FunctionComponent<{
      label: string;
      value: string;
    }> = (props) =>
      props.value ? (
        <div className="cell">
          <span className="label ff-header">{props.label}</span>
          <span className="value ff-text">{props.value}</span>
        </div>
      ) : null;

    return (
      <div className="extra-details">
        <div className="extra-row damage">
          <Stat
            label="Damage"
            value={`${formatNumber(self.stats.damage.total)} (${formatNumber(
              self.stats.damage.perSecond
            )})`}
          />
          <Stat label="Max" value={self.stats.damage.max} />
          <Stat label="Crit%" value={formatPercent(self.stats.damage.crit)} />
          <Stat
            label="Direct%"
            value={formatPercent(self.stats.damage.directHit)}
          />
          <Stat
            label="DirectCrit%"
            value={formatPercent(self.stats.damage.critDirectHit)}
          />
        </div>
        <hr />
        <div className="extra-row healing">
          <Stat
            label="Heals"
            value={`${formatNumber(self.stats.healing.total)} (${formatNumber(
              self.stats.healing.perSecond
            )})`}
          />
          <Stat label="Max" value={self.stats.healing.max} />
          <Stat label="Crit%" value={formatPercent(self.stats.healing.crit)} />
        </div>
      </div>
    );
  }
}

interface HeaderProps {
  encounter: Encounter;
  onSelectEncounter: (index: Option<number>) => void;
  currentView: View;
  encounterOptions: Array<IndexedEncounter>;
  onSelectView: (_: View) => void;
}

interface HeaderState {
  showStats: boolean;
  showEncounterSelector: boolean;
  showViewSelector: boolean;
}

class Header extends React.Component<HeaderProps, HeaderState> {
  constructor(props: HeaderProps) {
    super(props);
    this.state = {
      showStats: false,
      showEncounterSelector: false,
      showViewSelector: false,
    };
  }

  toggleStats(value = !this.state.showStats) {
    this.setState({ showStats: value });
  }

  toggleEncounterSelector(value = !this.state.showEncounterSelector) {
    this.setState({
      showEncounterSelector: value,
      showViewSelector: false,
    });
  }

  onSelectEncounter(index: Option<number>) {
    this.toggleEncounterSelector(false);
    this.props.onSelectEncounter(index);
  }

  toggleViewSelector(value = !this.state.showViewSelector) {
    this.setState({
      showEncounterSelector: false,
      showViewSelector: value,
    });
  }

  onSelectView(view: View) {
    this.toggleViewSelector(false);
    this.props.onSelectView(view);
  }

  render() {
    const encounter = this.props.encounter;
    const self = _.find(encounter.combatants, ({ isSelf }) => isSelf) ?? null;

    const viewSummary = {
      [View.Damage]: `Damage (${formatNumber(
        encounter.stats.damage.perSecond
      )} dps)`,
      [View.Healing]: `Healing (${formatNumber(
        encounter.stats.healing.perSecond
      )} hps)`,
      [View.Tanking]: `Damage Taken`,
      [View.Uptime]: `Uptime`,
      [View.Deaths]: `Deaths (${encounter.stats.deaths} total)`,
      [View.Revives]: `Revives (${encounter.stats.revives} total)`,
    };
    const currentViewSummary = viewSummary[this.props.currentView];

    return (
      <div
        className={`header view-color ${this.props.currentView.toLowerCase()}`}
        onClick={() => {
          this.toggleViewSelector(false);
          this.toggleEncounterSelector(false);
        }}
      >
        <div className="encounter-header">
          <div className="encounter-data ff-header dropdown-parent">
            <span
              className="target-name"
              onClick={noBubble(() => this.toggleEncounterSelector())}
            >
              {formatEncounter(encounter)}
            </span>
            {this.state.showEncounterSelector ? (
              <div className={`dropdown-menu encounters-list-dropdown`}>
                {this.props.encounterOptions.map(
                  ({ index, ...encounter }, i) => (
                    <div
                      key={i}
                      className="dropdown-menu-item target-name"
                      onClick={() => this.onSelectEncounter(index)}
                    >
                      {formatEncounter(encounter)}
                    </div>
                  )
                )}
              </div>
            ) : null}
            {self !== null ? (
              <span
                className={`arrow ${this.state.showStats ? "up" : "down"}`}
                onClick={() => this.toggleStats()}
              />
            ) : null}
          </div>
          <div className="encounter-data ff-header dropdown-parent">
            <span
              className="target-name"
              onClick={noBubble(() => this.toggleViewSelector())}
            >
              {currentViewSummary}
            </span>
            {this.state.showViewSelector ? (
              <div className={`dropdown-menu right view-list-dropdown`}>
                {Object.entries(View).map(([key, value]) => (
                  <div
                    className="dropdown-menu-item target-name"
                    key={key}
                    onClick={() => this.onSelectView(value)}
                  >
                    {viewSummary[value]}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {this.state.showStats && self !== null ? <Stats self={self} /> : null}
      </div>
    );
  }
}

interface CombatantsProps {
  combatants: Array<Combatant>;
  currentView: View;
}

class Combatants extends React.Component<CombatantsProps> {
  shouldComponentUpdate(nextProps: CombatantsProps) {
    // if data is empty then don't re-render
    if (Object.getOwnPropertyNames(nextProps.combatants).length === 0) {
      return false;
    }

    return true;
  }

  render() {
    const maxRows = 12;
    let max: number;

    const rows = _.take(this.props.combatants, maxRows).map(
      (combatant, rank) => {
        const actor = combatant.job === LIMIT_BREAK ? "lb" : combatant.job;
        const job = combatant.job === LIMIT_BREAK ? "" : combatant.job;

        const stats = _.merge(
          {
            actor,
            job,
            characterName: combatant.name,
            isSelf: combatant.isSelf,
          },
          {
            [View.Damage]: {
              format: formatNumber,
              total: combatant.stats.damage.total,
              extra: [
                formatNumber(combatant.stats.damage.perSecond),
                formatPercent(combatant.stats.damage.relative),
              ],
            },
            [View.Healing]: {
              format: formatNumber,
              total: combatant.stats.healing.total,
              note: `${formatPercent(combatant.stats.healing.overheal)} OH`,
              extra: [
                formatNumber(combatant.stats.healing.perSecond),
                formatPercent(combatant.stats.healing.relative),
              ],
            },
            [View.Tanking]: {
              format: formatNumber,
              total: combatant.stats.tanking.total,
              extra: [formatPercent(combatant.stats.tanking.relative)],
            },
            [View.Uptime]: {
              format: formatSpan,
              total: combatant.stats.uptime.total,
              extra: [formatPercent(combatant.stats.uptime.relative)],
            },
            [View.Deaths]: {
              format: _.identity,
              total: combatant.stats.deaths,
              extra: [],
            },
            [View.Revives]: {
              format: _.identity,
              total: combatant.stats.revives,
              extra: [],
            },
          }[this.props.currentView]
        );

        max = max || stats.total;

        return (
          <CombatantCompact
            rank={rank + 1}
            key={combatant.name}
            max={max}
            {...stats}
          />
        );
      }
    );

    return <ul className="combatants">{rows}</ul>;
  }
}

interface DamageMeterProps {
  data: Encounter;
  encounterOptions: Array<IndexedEncounter>;
  onSelectEncounter: (index: Option<number>) => void;
  debug: boolean;
}

interface DamageMeterState {
  currentView: View;
}

class DamageMeter extends React.Component<DamageMeterProps, DamageMeterState> {
  constructor(props: DamageMeterProps) {
    super(props);
    this.state = {
      currentView: View.Damage,
    };
  }

  handleViewChange(currentView: View) {
    this.setState({ currentView });
  }

  render() {
    const encounter = this.props.data;

    const stat = {
      [View.Damage]: (c: Combatant["stats"]) => c.damage.total,
      [View.Healing]: (c: Combatant["stats"]) => c.healing.total,
      [View.Tanking]: (c: Combatant["stats"]) => c.tanking.total,
      [View.Uptime]: (c: Combatant["stats"]) => c.uptime.total,
      [View.Deaths]: (c: Combatant["stats"]) => c.deaths,
      [View.Revives]: (c: Combatant["stats"]) => c.revives,
    }[this.state.currentView];

    const combatants = _.sortBy(
      _.filter(encounter.combatants, (d) => stat(d.stats) > 0),
      (d) => -stat(d.stats)
    );

    return (
      <div className="damage-meter">
        <Header
          encounter={encounter}
          encounterOptions={this.props.encounterOptions}
          onSelectView={(view) => this.handleViewChange(view)}
          onSelectEncounter={this.props.onSelectEncounter}
          currentView={this.state.currentView}
        />
        <Combatants
          currentView={this.state.currentView}
          combatants={combatants}
        />
        {!this.props.debug ? null : (
          <div>
            <Debugger data={encounter} />
          </div>
        )}
      </div>
    );
  }
}

interface DebuggerProps {
  data: Encounter;
}

class Debugger extends React.PureComponent<DebuggerProps> {
  constructor(props: DebuggerProps) {
    super(props);
  }

  render() {
    const css: React.CSSProperties = {
      overflowY: "scroll",
      maxHeight: "250px",
    };
    return <pre style={css}>{JSON.stringify(this.props.data, null, 2)}</pre>;
  }
}

interface AppProps {
  env: { debug: boolean };
}

interface AppState {
  playerName: string;
  currentEncounter: Option<Encounter>;
  history: Array<Encounter>;
  selectedEncounter: Option<Encounter>;
  rollingLogData: Option<LogData>;
  serverTime: Date;
  lastLogLine: Option<number>;
}

class App extends React.Component<AppProps, AppState> {
  static readonly CLOCK_UPDATE_INTERVAL: Span = 100;
  static readonly HISTORY_KEY = "meters";
  static readonly PLAYER_NAME_KEY = "playerName";

  static env(query: Dict): AppProps["env"] {
    return {
      debug: "debug" in query,
    };
  }

  constructor(props: AppProps) {
    super(props);

    this.state = {
      playerName: ACT.YOU,
      currentEncounter: null,
      history: [],
      selectedEncounter: null,
      rollingLogData: null,
      serverTime: new Date(0),
      lastLogLine: null,
    };
  }

  componentDidMount() {
    addEventListener<ACT.LogLine>("onLogLine", (e) => this.onLogLine(e));
    addEventListener<ACT.DataUpdate>("onOverlayDataUpdate", (e) =>
      this.onOverlayDataUpdate(e)
    );
    addEventListener<ACT.StateUpdate>("onOverlayStateUpdate", (e) =>
      this.onOverlayStateUpdate(e)
    );

    const withLoad = (key: string, f: (_: string) => void) => {
      const value = localStorage.getItem(key);
      if (value) f(value);
    };

    let storedPlayerName = this.state.playerName;

    withLoad(App.PLAYER_NAME_KEY, (playerName) => {
      storedPlayerName = playerName;
      this.setState({ playerName });
    });

    withLoad(App.HISTORY_KEY, (payload) => {
      let history;

      try {
        history = JSON.parse(payload);
      } catch (ex) {
        console.error(`Couldn't load state: ${ex}`);
      }

      if (history) {
        history = _.map(history, (data) => reconstruct(data, storedPlayerName));
        this.setState({ history });
      }
    });
  }

  onOverlayStateUpdate(e: CustomEvent<ACT.StateUpdate>) {
    if (!e.detail.isLocked) {
      document.documentElement.classList.add("resizable");
    } else {
      document.documentElement.classList.remove("resizable");
    }
  }

  onOverlayDataUpdate(e: CustomEvent<ACT.DataUpdate>) {
    const update = e.detail;
    // Encounters without combatants can be nearby pulls in public areas that
    // you aren't involved in. Drop those updates unless they include someone.
    if (_.isEmpty(update.Combatant)) return;

    // Unlikely, but let log line tick if it hasn't already
    if (this.state.lastLogLine === null) return;

    let { history, rollingLogData } = this.state;

    // Encounter started
    if (this.state.currentEncounter === null && ACT.isActive(update)) {
      const updateLag = performance.now() - this.state.lastLogLine;
      rollingLogData = LogData.startNew({
        encounterStart: this.state.serverTime.add(updateLag),
      });
      this.setState({ selectedEncounter: null, rollingLogData });
    }

    // We expect this to never be true: when the first update comes in,
    // rollingLogData is set, and it's only cleared after the last update comes
    // in.
    if (rollingLogData === null) return;

    // Only use our latest log data if the encounter's timer advanced. It's
    // possible that testing `isActive` is the right way to do this instead. The
    // idea is that if we get data updates after the encounter is over, the last
    // log data we applied is the most semantically correct one.
    const logData =
      this.state.currentEncounter !== null &&
      ACT.duration(this.state.currentEncounter.source.actData) ===
        ACT.duration(update)
        ? this.state.currentEncounter.source.logData
        : rollingLogData;

    const encounter = parseEncounter({
      playerName: this.state.playerName,
      logData,
      actData: update,
    });

    // Encounter ended
    if (this.state.currentEncounter !== null && !ACT.isActive(update)) {
      history = [encounter].concat(history).slice(0, 10);

      const raw = _.map(history, "source");
      localStorage.setItem(App.HISTORY_KEY, JSON.stringify(raw));
      this.setState({ currentEncounter: null, rollingLogData: null, history });
    } else {
      this.setState({ currentEncounter: encounter });
    }
  }

  setPlayerName(playerName: string) {
    if (playerName !== this.state.playerName) {
      localStorage.setItem(App.PLAYER_NAME_KEY, playerName);
      this.setState({ playerName });
    }
  }

  onLogLine(e: CustomEvent<ACT.LogLine>) {
    const [code, timestamp, ...message] = JSON.parse(e.detail);
    // Sometimes the log lines go backwards in time, though I think this is
    // impossible within the codes we use.
    const serverTime = Date.max(this.state.serverTime, new Date(timestamp));
    const lastLogLine = performance.now();

    const applyUpdate = (sourceName: string, f: (_: Activity) => Activity) => {
      this.setState({ serverTime, lastLogLine });

      if (this.state.rollingLogData !== null) {
        let rollingLogData = this.state.rollingLogData;
        rollingLogData = LogData.updateTime(rollingLogData, serverTime);
        rollingLogData = LogData.updateActivity(rollingLogData, sourceName, f);
        this.setState({ rollingLogData });
      }
    };

    if (code === "02") {
      const [_playerID, playerName] = message;
      this.setPlayerName(playerName);
    } else if (code === "20") {
      // Start casting
      const [_sourceID, sourceName] = message;
      applyUpdate(sourceName, (data) => fset(data, { castStart: serverTime }));
    } else if (code === "23") {
      // Cancelled cast
      const [_sourceID, sourceName] = message;
      applyUpdate(sourceName, (data) => fset(data, { castStart: null }));
    } else if (code === "21" || code === "22") {
      // Action used
      const [_sourceID, sourceName, actionIDStr] = message;
      applyUpdate(sourceName, ({ castStart, lastCredit, uptime, revives }) => {
        // If you were casting, you get credit for the duration of that cast or
        // `GCD`, whichever is greater. If you weren't casting, you get `GCD`
        // worth of uptime credited to you. In both cases, we can't tell how much
        // your GCD is due to spell/skill speed.
        const [uptimeCredit, creditTime] =
          castStart !== null
            ? [Math.max(GCD, Date.diff(serverTime, castStart)), castStart]
            : [GCD, serverTime];

        // However, in either case, if `GCD` has not elapsed between the two
        // credit times, the next credit is reduced so as not to double-credit.
        // Example: if I use an action at time t then another at t+1s, I would get
        // 3.5s total uptime credit. Another example: if I cast two 2s spells back
        // to back, I will get 4.5s of credit. This is a best approximation with
        // the information we have available.
        const uptimeOvercredit = Math.max(
          0,
          GCD - Date.diff(creditTime, lastCredit)
        );

        const actionID = parseInt(actionIDStr, 16);
        const reviveSpells = {
          [173]: "Resurrection", // SCH/SMN
          [7523]: "Verraise", // RDM
          [125]: "Raise", // WHM
          [3603]: "Ascend", // AST
          [24287]: "Egeiro", // SGE
        };

        return {
          castStart: null,
          lastCredit: creditTime,
          uptime: uptime + uptimeCredit - uptimeOvercredit,
          revives: actionID in reviveSpells ? revives + 1 : revives,
        };
      });
    } else if (
      // Limit our time updates since they happen much more frequently than
      // action updates
      serverTime > this.state.serverTime.add(App.CLOCK_UPDATE_INTERVAL)
    ) {
      const rollingLogData =
        this.state.rollingLogData === null
          ? null
          : LogData.updateTime(this.state.rollingLogData, serverTime);

      this.setState({ serverTime, lastLogLine, rollingLogData });
    }
  }

  onSelectEncounter(index: Option<number>) {
    if (index !== null && index >= 0) {
      this.setState({
        selectedEncounter: this.state.history[index],
      });
    } else {
      this.setState({
        selectedEncounter: null,
      });
    }
  }

  render() {
    const index = (encounter: Encounter, index: Option<number>) =>
      Object.assign({ index }, encounter);
    const indexedHistory = this.state.history.map(index);
    const encounterOptions =
      this.state.currentEncounter !== null
        ? [index(this.state.currentEncounter, null)].concat(indexedHistory)
        : indexedHistory;

    // View in terms of priority
    const encounterView = _.first(
      _.compact([
        this.state.selectedEncounter,
        this.state.currentEncounter,
        this.state.history[0],
      ])
    );

    return encounterView != null ? (
      <DamageMeter
        data={encounterView}
        encounterOptions={encounterOptions}
        onSelectEncounter={(index) => this.onSelectEncounter(index)}
        debug={this.props.env.debug}
      />
    ) : (
      <h3>Awaiting data.</h3>
    );
  }
}

export default App;
