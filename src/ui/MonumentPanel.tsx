import { useWorldStore } from '../store';
import { MONUMENT_KINDS } from '../store/model';
import type { MonumentKind } from '../core/types';
import { LandmarkGlyph, Panel, Select } from './controls';

const MONUMENT_LABEL: Record<MonumentKind, string> = {
  hospital: 'Hospital',
  stadium: 'Stadium',
  funfair: 'Funfair',
  'swimming-pool': 'Swimming pool',
  'dinosaur-park': 'Dinosaur park',
  supermarket: 'Supermarket',
  'open-air-theatre': 'Open-air theatre',
  circus: 'Circus',
  'fire-station': 'Fire station',
  'gothic-cathedral': 'Gothic cathedral',
};

export interface MonumentPanelProps {
  blockId: string;
  /** Monument the block has before any override. */
  base?: MonumentKind;
}

export function MonumentPanel({ blockId, base = 'hospital' }: MonumentPanelProps) {
  const override = useWorldStore((st) => st.blockOverrides[blockId]);
  const setOverride = useWorldStore((st) => st.setOverride);
  const current: MonumentKind = override?.monument ?? base;

  return (
    <Panel id="selection" title="Monument block" icon={<LandmarkGlyph />}>
      <Select<MonumentKind>
        id="monument-kind"
        label="Monument"
        value={current}
        options={MONUMENT_KINDS.map((k) => ({ value: k, label: MONUMENT_LABEL[k] }))}
        onChange={(k) => setOverride({ type: 'block', id: blockId }, { monument: k })}
      />
    </Panel>
  );
}
