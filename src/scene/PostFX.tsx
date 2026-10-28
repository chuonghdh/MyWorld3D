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

/** Blur strength of the tilt-shift, in pixels at the edge of the frame. */
const TILT_BLUR_PX = 2.2;

export function PostFX({ tiltShift, night }: { tiltShift: boolean; night: boolean }) {
  const { gl, scene, camera, size } = useThree();

  const fx = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.15, 0.5, 0.92);
    composer.addPass(bloom);
    const tiltH = new ShaderPass(HorizontalTiltShiftShader);
    const tiltV = new ShaderPass(VerticalTiltShiftShader);
    composer.addPass(tiltH);
    composer.addPass(tiltV);
    composer.addPass(new OutputPass());
    return { composer, bloom, tiltH, tiltV };
  }, [gl, scene, camera]);

  useEffect(() => {
    fx.composer.setPixelRatio(gl.getPixelRatio());
    fx.composer.setSize(size.width, size.height);
    fx.tiltH.uniforms.h.value = TILT_BLUR_PX / size.width;
    fx.tiltV.uniforms.v.value = TILT_BLUR_PX / size.height;
    fx.tiltH.uniforms.r.value = 0.5;
    fx.tiltV.uniforms.r.value = 0.5;
  }, [fx, gl, size.width, size.height]);

  useEffect(() => {
    fx.tiltH.enabled = tiltShift;
    fx.tiltV.enabled = tiltShift;
    fx.bloom.strength = night ? 0.5 : 0.15;
    fx.bloom.threshold = night ? 0.7 : 0.92;
    fx.bloom.radius = night ? 0.6 : 0.4;
  }, [fx, tiltShift, night]);

  useEffect(() => () => fx.composer.dispose(), [fx]);

  // Priority 1 takes over rendering from R3F's default render loop.
  useFrame((_, dt) => {
    fx.composer.render(dt);
  }, 1);

  return null;
}
