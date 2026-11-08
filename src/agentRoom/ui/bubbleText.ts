// Bubble text for an event (pure). Only tool names, agent names and file names: no prompt or input contents.
import type { RoomEvent } from '../model/types';
import { AGENT_LABEL } from '../world/palette';

export function bubbleText(e: RoomEvent): string {
  switch (e.kind) {
    case 'session_start':
      return 'session start';
    case 'session_end':
      return 'session end';
    case 'prompt':
      return 'thinking...';
    case 'tool_start':
      return e.tool;
    case 'tool_end':
      return e.ok ? `${e.tool} done` : `${e.tool} failed`;
    case 'delegate':
      return `-> ${AGENT_LABEL[e.to]}`;
    case 'subagent_done':
      return 'done';
    case 'notify':
      return 'needs you';
    case 'file_touch':
      return e.path.split('/').pop() ?? e.path;
    case 'claim_change':
      return `claim ${e.status}`;
    case 'task_state':
      return `${e.task}: ${e.state}`;
    case 'error':
      return 'error';
  }
}
