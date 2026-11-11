import { teamLabel, type SavedTeam } from "../teamUrl.ts";

interface Props {
  teams: SavedTeam[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onAdd: () => void;
}

export function TeamTabs({ teams, activeKey, onSelect, onAdd }: Props) {
  return (
    <div className="-mx-3 -mt-3 mb-3 flex items-end gap-1 overflow-x-auto border-b border-zinc-800 px-3 pt-2" role="tablist" aria-label="Fantasy teams">
      {teams.map((team) => {
        const selected = team.key === activeKey;
        return (
          <button
            key={team.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(team.key)}
            className={`max-w-48 shrink-0 truncate rounded-t-md border-b-2 px-3 py-1.5 text-sm ${
              selected ? "border-amber-400 font-medium text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {team.espnS2 && (
              <span aria-label="private league" className="mr-1 text-zinc-500">
                🔒
              </span>
            )}
            {teamLabel(team)}
          </button>
        );
      })}
      <button type="button" onClick={onAdd} className="shrink-0 px-2 py-1.5 text-sm text-zinc-400 hover:text-amber-300" aria-label="Add a team">
        + Add team
      </button>
    </div>
  );
}
