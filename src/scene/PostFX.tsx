// Post-processing: soft bloom (stronger at night so windows and lamps glow) and an optional
// tilt-shift that blurs the top and bottom of the view for the miniature look.
// Uses the passes that ship with three.js, so no extra packages.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/examples/jsm/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/examples/jsm/shaders/VerticalTiltShiftShader.js';

/**
 * Clamps the HDR scene colour and replaces NaN before the bloom blur. One bad pixel in a half-float
 * target is smeared by the blur mips into large black blocks, so it must never reach the bloom.
 */
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      bool bad = !(c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 && c.r < 1e4 && c.g < 1e4 && c.b < 1e4);
      c.rgb = bad ? vec3(0.0) : min(c.rgb, vec3(48.0));
      gl_FragColor = vec4(c.rgb, 1.0);
    }`,
};

/** Debug switches for tracking down rendering problems: ?nobloom, ?msaa=0, ?nosanitize. */
const DEBUG = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);

/** Blur strength of the tilt-shift, in pixels at the edge of the frame. */
const TILT_BLUR_PX = 2.2;

export function PostFX({
  tiltShift,
  night,
  bloomScale = 1,
  msaa = 4,
}: {
  tiltShift: boolean;
  night: boolean;
  /** Multiplier on bloom strength; 0 disables the bloom pass. */
  bloomScale?: number;
  /** MSAA samples of the composer's render target (edges stay antialiased at DPR 1). */
  msaa?: number;
}) {
  const { gl, scene, camera, size } = useThree();
  const dpr = useThree((s) => s.viewport.dpr);

  const samples = DEBUG.has('msaa') ? Number(DEBUG.get('msaa')) || 0 : msaa;
  const fx = useMemo(() => {
    // Same half-float target the composer would make, plus multisampling: the scene is drawn
    // offscreen, so the canvas' own antialiasing would not reach it.
    const target = new THREE.WebGLRenderTarget(size.width, size.height, {
      type: THREE.HalfFloatType,
      samples,
    });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));
    if (!DEBUG.has('nosanitize')) composer.addPass(new ShaderPass(SanitizeShader));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.15, 0.5, 0.92);
    composer.addPass(bloom);
    const tiltH = new ShaderPass(HorizontalTiltShiftShader);
    const tiltV = new ShaderPass(VerticalTiltShiftShader);
    composer.addPass(tiltH);
    composer.addPass(tiltV);
    composer.addPass(new OutputPass());
    return { composer, bloom, tiltH, tiltV };
    // size is read only for the initial target; the effect below resizes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, samples]);

  useEffect(() => {
    fx.composer.setPixelRatio(gl.getPixelRatio());
    fx.composer.setSize(size.width, size.height);
    fx.tiltH.uniforms.h.value = TILT_BLUR_PX / size.width;
    fx.tiltV.uniforms.v.value = TILT_BLUR_PX / size.height;
    fx.tiltH.uniforms.r.value = 0.5;
    fx.tiltV.uniforms.r.value = 0.5;
  }, [fx, gl, dpr, size.width, size.height]);

  useEffect(() => {
    fx.tiltH.enabled = tiltShift;
    fx.tiltV.enabled = tiltShift;
    fx.bloom.enabled = bloomScale > 0 && !DEBUG.has('nobloom');
    fx.bloom.strength = (night ? 0.5 : 0.15) * bloomScale;
    fx.bloom.threshold = night ? 0.7 : 0.92;
    fx.bloom.radius = night ? 0.6 : 0.4;
  }, [fx, tiltShift, night, bloomScale]);

  useEffect(() => () => fx.composer.dispose(), [fx]);

  // Priority 1 takes over rendering from R3F's default render loop.
  useFrame((_, dt) => {
    fx.composer.render(dt);
  }, 1);

  return null;
}
