import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  EASE,
  WEATHER_KINDS,
  createValues,
  snapValues,
  stepValues,
  thunderDelay,
  weatherTargets,
} from '../src/weather/weatherState';
import {
  FLASH_MAX_S,
  FLASH_MIN_S,
  LightningController,
  flashEnvelope,
  generateBolt,
} from '../src/weather/Lightning';
import { MAX_STREAKS, MAX_RIPPLES } from '../src/weather/Rain';
import { createWeather } from '../src/weather';
import { fogDensityMultiplier, applyFogRange } from '../src/weather/fog';
import { thunderCharacter } from '../src/audio/weather';
import { attachWeather, getBodyMaterial, weatherUniforms } from '../src/buildings/materials';
import { exportLayout, importLayout } from '../src/store/io';
import { createEmptyLayout, DEFAULT_SETTINGS } from '../src/store/model';

function seqRandom(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('thunder delay', () => {
  it('is distance / 340 seconds', () => {
    expect(thunderDelay(340)).toBeCloseTo(1, 6);
    expect(thunderDelay(1700)).toBeCloseTo(5, 6);
    expect(thunderDelay(0)).toBe(0);
    expect(thunderDelay(-5)).toBe(0);
  });

  it('queued thunder arrives within 0.1 s of distance / 340', () => {
    const l = new LightningController({ random: seqRandom(3) });
    const strike = l.trigger(1020); // 3 s
    expect(strike.distance).toBe(1020);
    let t = 0;
    let arrived = -1;
    const buf: ReturnType<typeof l.takeThunder> = [];
    while (t < 10 && arrived < 0) {
      l.update(0.02, 1, 0.5);
      t += 0.02;
      if (l.takeThunder(buf).length) arrived = t;
    }
    expect(Math.abs(arrived - 3)).toBeLessThan(0.1);
  });
});

describe('lightning', () => {
  it('flash lasts 150-400 ms and the envelope stays within 0..1', () => {
    const l = new LightningController({ random: seqRandom(9) });
    for (let n = 0; n < 30; n++) {
      const s = l.trigger();
      expect(s.duration).toBeGreaterThanOrEqual(FLASH_MIN_S);
      expect(s.duration).toBeLessThanOrEqual(FLASH_MAX_S);
      let t = 0;
      let peak = 0;
      while (l.strike) {
        l.update(0.005, 1, 0.5);
        t += 0.005;
        peak = Math.max(peak, l.flash);
        expect(l.flash).toBeGreaterThanOrEqual(0);
        expect(l.flash).toBeLessThanOrEqual(1);
      }
      expect(t).toBeGreaterThan(0.14);
      expect(t).toBeLessThan(0.42);
      expect(peak).toBeGreaterThan(0.2);
    }
    expect(flashEnvelope(0)).toBe(0);
    expect(flashEnvelope(1)).toBe(0);
  });

  it('never strikes outside a storm', () => {
    const l = new LightningController({ random: seqRandom(5) });
    for (let i = 0; i < 60 * 600; i++) l.update(1 / 60, 0, 1);
    expect(l.strike).toBeNull();
    expect(l.pendingCount).toBe(0);
  });

  it('strikes within a storm', () => {
    const l = new LightningController({ random: seqRandom(5) });
    let strikes = 0;
    let was = false;
    for (let i = 0; i < 60 * 120; i++) {
      l.update(1 / 60, 1, 0.8);
      if (l.strike && !was) strikes++;
      was = !!l.strike;
    }
    expect(strikes).toBeGreaterThan(3);
  });

  it('bolt geometry is finite and reaches the ground', () => {
    const v = generateBolt(seqRandom(2), 200);
    expect(v.length % 6).toBe(0);
    expect(v.length / 6).toBeLessThanOrEqual(40);
    for (const n of v) expect(Number.isFinite(n)).toBe(true);
    expect(Math.min(...Array.from(v).filter((_, i) => i % 3 === 1))).toBeGreaterThanOrEqual(0);
  });
});

describe('weather targets and easing', () => {
  it('clear has nothing', () => {
    const t = weatherTargets('clear', 1);
    expect(t.rain).toBe(0);
    expect(t.wet).toBe(0);
    expect(t.snowCover).toBe(0);
    expect(t.dim).toBe(1);
  });

  it('cloudy is dry and its intensity thickens and darkens the overcast', () => {
    const lo = weatherTargets('cloudy', 0);
    const hi = weatherTargets('cloudy', 1);
    expect(hi.rain).toBe(0);
    expect(hi.wet).toBe(0);
    expect(hi.cloud).toBeGreaterThan(lo.cloud);
    expect(hi.cloud).toBeGreaterThan(0.9);
    expect(hi.dim).toBeLessThan(lo.dim);
    expect(hi.storm).toBe(0);
  });

  it('every kind stays in range for all intensities', () => {
    for (const k of WEATHER_KINDS) {
      for (let i = 0; i <= 10; i++) {
        const t = weatherTargets(k, i / 10);
        for (const [key, v] of Object.entries(t)) {
          expect(v, `${k} ${key}`).toBeGreaterThanOrEqual(0);
          expect(v, `${k} ${key}`).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(weatherTargets('storm', 1).rain).toBe(1);
    expect(weatherTargets('snow', 1).snowfall).toBe(1);
    expect(weatherTargets('rain', 0.5).snowfall).toBe(0);
  });

  it('wetness eases in over seconds and out more slowly', () => {
    const v = createValues();
    const rain = weatherTargets('rain', 1);
    stepValues(v, rain, 1);
    expect(v.wet).toBeGreaterThan(0);
    expect(v.wet).toBeLessThan(0.5);
    for (let i = 0; i < 60; i++) stepValues(v, rain, 1);
    expect(v.wet).toBeGreaterThan(0.95);
    const dry = weatherTargets('clear', 0);
    for (let i = 0; i < EASE.wet[0]; i++) stepValues(v, dry, 1);
    expect(v.wet).toBeGreaterThan(0.5); // drying is slower than wetting
    for (let i = 0; i < 200; i++) stepValues(v, dry, 1);
    expect(v.wet).toBeLessThan(0.01);
  });

  it('snap jumps at once', () => {
    const v = snapValues(createValues(), weatherTargets('snow', 1));
    expect(v.snowCover).toBeGreaterThan(0.9);
  });
});

describe('fog', () => {
  it('density multiplier grows with fog and rain, is 1 when clear', () => {
    expect(fogDensityMultiplier(0, 0, 0)).toBe(1);
    expect(fogDensityMultiplier(1)).toBeGreaterThan(fogDensityMultiplier(0.5));
    expect(fogDensityMultiplier(0, 1)).toBeGreaterThan(1);
  });

  it('applyFogRange shrinks the range', () => {
    const f = new THREE.Fog('#fff', 100, 400);
    applyFogRange(f, 100, 400, 4);
    expect(f.near).toBe(25);
    expect(f.far).toBe(100);
  });
});

describe('thunder sound character', () => {
  it('is quieter and duller when far', () => {
    const near = thunderCharacter(100, 1);
    const far = thunderCharacter(3000, 1);
    expect(near.gain).toBeGreaterThan(far.gain);
    expect(near.cutoff).toBeGreaterThan(far.cutoff);
    expect(far.length).toBeGreaterThan(near.length);
  });
});

describe('weather controller', () => {
  const ctx = { camera: { x: 0, y: 30, z: 0 }, wind: { x: 2, z: 1 }, lightLevel: 1 };

  it('clear weather draws nothing', () => {
    const w = createWeather();
    w.update(0.016, ctx);
    w.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) expect(o.visible).toBe(false);
    });
    expect(weatherUniforms.uWet.value).toBe(0);
    w.dispose();
  });

  it('rain fills streaks within the budget and wets the surfaces', () => {
    const w = createWeather();
    w.setWeather('rain', 1, true);
    const o = w.update(0.016, ctx);
    expect(o.rain).toBeGreaterThan(0.5);
    expect(o.wetness).toBeGreaterThan(0.5);
    expect(weatherUniforms.uWet.value).toBeGreaterThan(0.5);
    expect(MAX_STREAKS).toBeLessThan(15000);
    expect(MAX_RIPPLES).toBeLessThan(300);
    let drawn = 0;
    w.group.traverse((c) => {
      const g = (c as THREE.Mesh).geometry;
      if ((c as THREE.Mesh).isMesh && c.visible && g instanceof THREE.InstancedBufferGeometry) {
        drawn++;
        expect(g.instanceCount).toBeLessThan(15000);
      }
    });
    expect(drawn).toBeLessThanOrEqual(3); // streaks + ripples + a light fog bank
    w.dispose();
    expect(weatherUniforms.uWet.value).toBe(0);
  });

  it('only a storm produces flashes and thunder', () => {
    const rainOnly = createWeather({ random: seqRandom(4) });
    rainOnly.setWeather('rain', 1, true);
    let rainClaps = 0;
    for (let i = 0; i < 60 * 120; i++) {
      rainOnly.update(1 / 60, ctx);
      rainClaps += rainOnly.thunder.length;
    }
    expect(rainClaps).toBe(0);

    const storm = createWeather({ random: seqRandom(4) });
    storm.setWeather('storm', 1, true);
    let maxFlash = 0;
    let stormClaps = 0;
    for (let i = 0; i < 60 * 180; i++) {
      maxFlash = Math.max(maxFlash, storm.update(1 / 60, ctx).flash);
      for (const t of storm.thunder) {
        stormClaps++;
        expect(Number.isFinite(t.angle)).toBe(true); // every clap knows where its strike was
      }
    }
    expect(maxFlash).toBeGreaterThan(0.2);
    expect(stormClaps).toBeGreaterThan(0);
  });

  it('snow covers upward surfaces slowly', () => {
    const w = createWeather();
    w.setWeather('snow', 1);
    let o = w.update(0.25, ctx);
    expect(o.snow).toBeLessThan(0.3);
    for (let i = 0; i < 240; i++) o = w.update(0.25, ctx);
    expect(o.snow).toBeGreaterThan(0.8);
    expect(o.snowfall).toBeGreaterThan(0.9);
    w.dispose();
  });
});

describe('weather shader hooks', () => {
  const VERT = '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}';
  const FRAG =
    '#include <common>\nvoid main() {\n#include <color_fragment>\n#include <normal_fragment_maps>\n#include <emissivemap_fragment>\n#include <opaque_fragment>\n}';
  const run = (m: THREE.Material) => {
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: VERT, fragmentShader: FRAG };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
    return shader;
  };

  it('uniforms default to 0', () => {
    expect(weatherUniforms.uWet.value).toBe(0);
    expect(weatherUniforms.uSnow.value).toBe(0);
  });

  it('the shared body material uses the shared uniforms and keeps its patterns', () => {
    const s = run(getBodyMaterial());
    expect(s.uniforms.uWet).toBe(weatherUniforms.uWet);
    expect(s.uniforms.uSnow).toBe(weatherUniforms.uSnow);
    expect(s.fragmentShader).toContain('uSnow');
    expect(s.fragmentShader).toContain('patBrick');
    expect(s.vertexShader).toContain('vWxPos');
  });

  it('attachWeather patches other standard materials once', () => {
    const m = new THREE.MeshStandardMaterial();
    attachWeather(m);
    attachWeather(m);
    const s = run(m);
    expect(s.uniforms.uWet).toBe(weatherUniforms.uWet);
    expect(s.fragmentShader.split('uniform float uWet;').length - 1).toBe(1);
    expect(m.customProgramCacheKey()).toContain('wx1');
  });
});

describe('weather settings persistence', () => {
  it('defaults to clear', () => {
    expect(DEFAULT_SETTINGS.weather).toBe('clear');
    expect(DEFAULT_SETTINGS.weatherIntensity).toBeGreaterThan(0);
  });

  it('round-trips through JSON', () => {
    const layout = createEmptyLayout(3);
    layout.settings = { ...layout.settings, weather: 'storm', weatherIntensity: 0.8 };
    const res = importLayout(exportLayout(layout));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.layout.settings.weather).toBe('storm');
      expect(res.layout.settings.weatherIntensity).toBe(0.8);
    }
  });

  it('old files without weather load as clear, bad values are rejected', () => {
    const layout = createEmptyLayout(3);
    const o = JSON.parse(exportLayout(layout));
    delete o.settings.weather;
    delete o.settings.weatherIntensity;
    const res = importLayout(JSON.stringify(o));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.layout.settings.weather).toBe('clear');
    o.settings.weather = 'hail';
    expect(importLayout(JSON.stringify(o)).ok).toBe(false);
  });
});
