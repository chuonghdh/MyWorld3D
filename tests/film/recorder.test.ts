import { describe, expect, it } from 'vitest';
import {
  filmExtension,
  filmFileName,
  isRecordingSupported,
  mimeCandidates,
  pickMimeType,
} from '../../src/film/recorder';

const onlySupported = (...allowed: string[]) => (mime: string) => allowed.includes(mime);

describe('mimeCandidates', () => {
  it('lists mp4 first, then webm vp9, then webm, without audio codec', () => {
    expect(mimeCandidates(false)).toEqual([
      'video/mp4;codecs="avc1.42E028"',
      'video/webm;codecs=vp9',
      'video/webm',
    ]);
  });

  it('adds the mp4a audio codec to the mp4 candidate when audio is recorded', () => {
    const list = mimeCandidates(true);
    expect(list[0]).toBe('video/mp4;codecs="avc1.42E028,mp4a.40.2"');
    expect(list.slice(1)).toEqual(['video/webm;codecs=vp9', 'video/webm']);
  });
});

describe('pickMimeType', () => {
  it('prefers mp4 when supported', () => {
    const all = (): boolean => true;
    expect(pickMimeType(all, false)).toBe('video/mp4;codecs="avc1.42E028"');
    expect(pickMimeType(all, true)).toBe('video/mp4;codecs="avc1.42E028,mp4a.40.2"');
  });

  it('falls back to webm vp9, then plain webm', () => {
    expect(pickMimeType(onlySupported('video/webm;codecs=vp9', 'video/webm'), false)).toBe(
      'video/webm;codecs=vp9',
    );
    expect(pickMimeType(onlySupported('video/webm'), true)).toBe('video/webm');
  });

  it('returns null when nothing is supported', () => {
    expect(pickMimeType(() => false, false)).toBeNull();
  });
});

describe('filmExtension', () => {
  it('maps mp4 and webm MIME types to file extensions', () => {
    expect(filmExtension('video/mp4;codecs=avc1')).toBe('mp4');
    expect(filmExtension('video/mp4')).toBe('mp4');
    expect(filmExtension('video/webm;codecs=vp9')).toBe('webm');
    expect(filmExtension('video/webm')).toBe('webm');
  });
});

describe('filmFileName', () => {
  const ts = Date.UTC(2026, 10, 4, 12, 30, 5, 123);

  it('builds a filename-safe name with .mp4 for mp4', () => {
    expect(filmFileName('video/mp4;codecs=avc1', ts)).toBe(
      'myworld3d-film-2026-11-04T12-30-05-123Z.mp4',
    );
  });

  it('uses .webm for webm', () => {
    const name = filmFileName('video/webm;codecs=vp9', ts);
    expect(name).toBe('myworld3d-film-2026-11-04T12-30-05-123Z.webm');
    expect(name).not.toMatch(/[:\s]/);
  });
});

describe('isRecordingSupported', () => {
  it('returns false in node, where MediaRecorder is absent', () => {
    expect(isRecordingSupported()).toBe(false);
  });
});
