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

type RouteComp = ComponentType<{ params: Record<string, unknown> }>;

export const ROUTES: Record<string, RouteComp> = {
  office: Office,
  inbox: InboxScreen,
  news: NewsScreen,
  roster: Roster,
  player: PlayerScreen,
  market: Market,
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
  career: CareerScreen,
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
