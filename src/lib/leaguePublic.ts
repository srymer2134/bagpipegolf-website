// Public league page — the one read (`get_public_league`, anon) and the
// small helpers the three /l/[id] pages share. Mirrors the Flutter
// contract in lib/features/leagues/utils/league_standings_snapshot.dart
// (`v` = 1) and the week-sheet tee-time arithmetic.
import type { SupabaseClient } from '@supabase/supabase-js';

export type PublicLeague = {
  league: {
    id: string;
    name: string;
    description: string | null;
    points_model: string | null;
    week_format: string | null;
    team_size: number | null;
    holes_per_week: number | null;
    default_tee: string | null;
    default_course_id: string | null;
    standings_name: string | null;
    half_split_slot: number | null;
    status: 'active' | 'completed';
    commissioner: string;
  };
  teams: Array<{ id: string; name: string; seed: number | null; withdrawn_from_slot: number | null }>;
  team_members: Array<{ team_id: string; display_name: string; position: number; from_slot: number; to_slot: number | null }>;
  members: Array<{ display_name: string; handicap: number | null }>;
  weeks: Array<{
    slot_index: number; week_of: string; status: string; tee: string | null; holes: number | null;
    first_tee_at: string | null; tee_interval_minutes: number | null; course_id: string | null;
    locked_at: string | null; position_round: boolean;
  }>;
  matchups: Array<{
    slot_index: number; match_index: number; home_team_id: string; away_team_id: string | null;
    outcome: string | null; has_round: boolean;
  }>;
  standings: { computed_at: string; standings: StandingsSnapshot } | null;
};

export type TeamRow = {
  team_id: string; name: string; seed: number | null; withdrawn_from_slot: number | null;
  points: number; available: number; wins: number; losses: number; ties: number;
  holes_up: number; byes: number; this_week: number; behind: number;
};
export type PlayerRow = {
  display_name: string; team_id: string; points: number; attendance: number; total: number;
  weeks_played: number; weeks_absent: number; weeks_as_sub: number;
};
export type StandingsSnapshot = {
  v: number;
  season: { rows: TeamRow[]; first_half: TeamRow[]; second_half: TeamRow[]; this_week_slot: number; counted_slots: number[] };
  players: PlayerRow[];
  unrated_course: boolean;
};

export async function getPublicLeague(supabase: SupabaseClient, id: string): Promise<PublicLeague | null> {
  const { data, error } = await supabase.rpc('get_public_league', { p_league_id: id });
  if (error) throw error;
  if (!data || typeof data !== 'object') return null;
  return data as PublicLeague;
}

export function isMatchPlay(l: PublicLeague): boolean {
  return l.league.points_model === 'match_play';
}

export function teamName(l: PublicLeague, teamId: string | null | undefined): string {
  if (!teamId) return 'bye';
  return l.teams.find((t) => t.id === teamId)?.name ?? 'Team';
}

/** Members on [teamId] at [slot], A then B. */
export function rosterAt(l: PublicLeague, teamId: string, slot: number): string[] {
  return l.team_members
    .filter((m) => m.team_id === teamId && m.from_slot <= slot && (m.to_slot == null || m.to_slot >= slot))
    .sort((a, b) => a.position - b.position)
    .map((m) => m.display_name);
}

/** Same arithmetic as the app's week sheet: first tee + N minutes. */
export function teeTimeAt(firstTee: string | null | undefined, minutes: number): string {
  if (!firstTee) return '';
  const [hs, ms = '0'] = firstTee.split(':');
  const h = Number.parseInt(hs ?? '', 10);
  if (!Number.isFinite(h)) return '';
  const m = Number.parseInt(ms, 10) || 0;
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
}

export function dateLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function fmtPts(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** The next scheduled week on or after today (UTC date), else the last. */
export function currentWeek(l: PublicLeague): PublicLeague['weeks'][number] | null {
  if (l.weeks.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = l.weeks.filter((w) => w.status !== 'cancelled' && w.week_of >= today);
  return upcoming[0] ?? l.weeks[l.weeks.length - 1] ?? null;
}

export function matchupsFor(l: PublicLeague, slot: number) {
  return l.matchups.filter((m) => m.slot_index === slot).sort((a, b) => a.match_index - b.match_index);
}

export function computedAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.round(ms / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Standings as CSV (the "report"). */
export function standingsCsv(l: PublicLeague): string {
  const s = l.standings?.standings;
  const esc = (v: unknown) => {
    const t = v == null ? '' : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines: string[] = [];
  lines.push(['League', l.league.name].map(esc).join(','));
  lines.push(['Computed', l.standings?.computed_at ?? ''].map(esc).join(','));
  lines.push('');
  lines.push(['Team', 'Pts', 'Of', 'W', 'L', 'T', 'Holes +/-', 'Behind', 'This week'].join(','));
  for (const r of s?.season.rows ?? []) {
    lines.push([r.name, r.points, r.available, r.wins, r.losses, r.ties, r.holes_up, r.behind, r.this_week].map(esc).join(','));
  }
  lines.push('');
  lines.push(['Player', 'Team', 'Pts', 'Attendance', 'Total', 'Played', 'Absent', 'As sub'].join(','));
  for (const p of s?.players ?? []) {
    lines.push([p.display_name, teamName(l, p.team_id), p.points, p.attendance, p.total, p.weeks_played, p.weeks_absent, p.weeks_as_sub].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}
