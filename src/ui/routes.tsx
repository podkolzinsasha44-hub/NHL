import type { ComponentType } from 'react';
import { Office } from './screens/Office';
import { InboxScreen } from './screens/Inbox';
import { NewsScreen } from './screens/News';
import { Roster } from './screens/Roster';
import { PlayerScreen } from './screens/Player';
import { Market } from './screens/Market';
import { TradeScreen } from './screens/Trade';
import { NegotiateScreen } from './screens/Negotiate';
import { LeagueScreen, PlayoffsScreen } from './screens/League';
import { MatchScreen } from './screens/Match';
import { MoreScreen } from './screens/More';
import { DraftRoom, DraftScreen, LotteryModal } from './screens/Draft';
import { FinanceScreen, StaffScreen, TeamScreen } from './screens/Club';
import { AchievementsScreen, AlbumScreen, CareerScreen, CelebrationModal, CompareScreen, GlossaryScreen, HistoryScreen, SearchScreen, SettingsScreen, WatchScreen, WrappedModal } from './screens/Extras';
import { ProCareerScreen, ProContract, ProHome, ProTeam } from './screens/Pro';
import { IntlScreen } from './screens/Intl';
import { useGame } from '../store/game';

type RouteComp = ComponentType<{ params: Record<string, unknown> }>;

/** Tab roots differ between a GM career and a player career. */
function byMode(gm: RouteComp, pro: ComponentType): RouteComp {
  return function ModeRoute(props) {
    const player = useGame((s) => s.L?.mode === 'player');
    const Pro = pro;
    const Gm = gm;
    return player ? <Pro /> : <Gm {...props} />;
  };
}

export const ROUTES: Record<string, RouteComp> = {
  office: byMode(Office, ProHome),
  inbox: InboxScreen,
  news: NewsScreen,
  roster: byMode(Roster, ProTeam),
  player: PlayerScreen,
  market: byMode(Market, ProContract),
  trade: TradeScreen,
  negotiate: NegotiateScreen,
  league: LeagueScreen,
  playoffs: PlayoffsScreen,
  more: MoreScreen,
  draft: DraftScreen,
  draftRoom: DraftRoom,
  finance: FinanceScreen,
  staff: StaffScreen,
  team: TeamScreen,
  career: byMode(CareerScreen, ProCareerScreen),
  intl: IntlScreen,
  history: HistoryScreen,
  achievements: AchievementsScreen,
  album: AlbumScreen,
  compare: CompareScreen,
  watch: WatchScreen,
  search: SearchScreen,
  glossary: GlossaryScreen,
  settings: SettingsScreen,
};

export const MODALS: Record<string, RouteComp> = {
  match: MatchScreen,
  celebration: CelebrationModal,
  wrapped: WrappedModal,
  lottery: LotteryModal,
};
