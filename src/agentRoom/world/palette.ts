// Agent colours and labels (view constants, not knobs).
import type { AgentId } from '../model/types';

export const AGENT_COLOR: Record<AgentId, string> = {
  lead: '#f2f2f2',
  buildings: '#e8833a',
  'city-streets': '#c9b26b',
  'traffic-life': '#5fd18a',
  'sky-environment': '#6cb8ff',
  audio: '#c48bff',
  'ui-camera': '#ff6fa8',
  'scene-qa': '#4fd6d0',
  architect: '#ffd35c',
  'graphics-character': '#ff6b5e',
};

export const AGENT_LABEL: Record<AgentId, string> = {
  lead: 'Lead',
  buildings: 'Buildings',
  'city-streets': 'City & Streets',
  'traffic-life': 'Traffic & Life',
  'sky-environment': 'Sky & Environment',
  audio: 'Audio',
  'ui-camera': 'UI & Camera',
  'scene-qa': 'Scene & QA',
  architect: 'Architect',
  'graphics-character': 'Graphics & Character',
};
