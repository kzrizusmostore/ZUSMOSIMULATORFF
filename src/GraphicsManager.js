import * as THREE from 'three';

const DEFAULT_FILTER = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  sharpness: 0,
  shadows: 0,
  highlights: 0,
  gamma: 1,
  warmth: 0
};

export class GraphicsManager {
  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera = camera;
    this.quality = 'hd';
    this.trackedObjects = new Map();
    this.lights = [];
    this.filterProfiles = {
      map: { ...DEFAULT_FILTER },
      character: { ...DEFAULT_FILTER }
    };
    this.filterShaders = {
      map: new Set(),
      character: new Set()
    };

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;
  }

  setLights(lights) {
    this.lights = lights;
    this.#applyShadowQuality();
  }

  trackObject(object, kind = 'map') {
    if (!object) return;
    const safeKind = kind === 'character' ? 'character' : 'map';
    this.trackedObjects.set(object, safeKind);
    this.#prepareObject(object, safeKind);
  }

  untrackObject(object) {
    const kind = this.trackedObjects.get(object);
    if (kind && object?.traverse) {
      object.traverse((node) => {
        if (!node.isMesh) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of mats) {
          const shader = mat?.userData?.zusmoShader;
          if (shader) this.filterShaders[kind]?.delete(shader);
        }
      });
    }
    this.trackedObjects.delete(object);
  }

  setQuality(mode) {
    this.quality = mode === 'hd' ? 'hd' : 'standard';
    const maxRatio = this.quality === 'hd' ? 1.5 : 1.20;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
    this.trackedObjects.forEach((kind, obj) => this.#applyTextures(obj, kind));
    this.#applyShadowQuality();
    this.resize(window.innerWidth, window.innerHeight);
  }

  setDisplayProfile(profile = {}) {
    if (Number.isFinite(profile.exposure)) this.renderer.toneMappingExposure = profile.exposure;
    this.filterProfiles.map = { ...DEFAULT_FILTER, ...(profile.map || {}) };
    this.filterProfiles.character = { ...DEFAULT_FILTER, ...(profile.character || {}) };
    this.#syncFilterUniforms('map');
    this.#syncFilterUniforms('character');
  }

  #prepareObject(object, kind) {
    const seen = new Set();
    object.traverse?.((node) => {
      if (!node.isMesh) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        if (!mat || seen.has(mat)) continue;
        seen.add(mat);
        this.#installFilter(mat, kind);
      }
    });
    this.#applyTextures(object, kind);
  }

  #installFilter(material, kind) {
    if (material.userData?.zusmoFilterInstalled) return;
    material.userData = material.userData || {};
    material.userData.zusmoFilterInstalled = true;
    material.userData.zusmoFilterKind = kind;
    const original = material.onBeforeCompile;

    material.onBeforeCompile = (shader, renderer) => {
      original?.call(material, shader, renderer);
      const profile = this.filterProfiles[kind] || DEFAULT_FILTER;
      const image = material.map?.image;
      const width = image?.width || image?.videoWidth || 1024;
      const height = image?.height || image?.videoHeight || 1024;

      shader.uniforms.zBrightness = { value: profile.brightness };
      shader.uniforms.zContrast = { value: profile.contrast };
      shader.uniforms.zSaturation = { value: profile.saturation };
      shader.uniforms.zSharpness = { value: profile.sharpness };
      shader.uniforms.zShadows = { value: profile.shadows };
      shader.uniforms.zHighlights = { value: profile.highlights };
      shader.uniforms.zGamma = { value: profile.gamma };
      shader.uniforms.zWarmth = { value: profile.warmth };
      shader.uniforms.zTexel = { value: new THREE.Vector2(1 / Math.max(1, width), 1 / Math.max(1, height)) };

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\n` +
          `uniform float zBrightness;\n` +
          `uniform float zContrast;\n` +
          `uniform float zSaturation;\n` +
          `uniform float zSharpness;\n` +
          `uniform float zShadows;\n` +
          `uniform float zHighlights;\n` +
          `uniform float zGamma;\n` +
          `uniform float zWarmth;\n` +
          `uniform vec2 zTexel;\n`
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP\n` +
          `  vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n` +
          `  if (zSharpness > 0.001) {\n` +
          `    vec3 n1 = texture2D(map, vMapUv + vec2(zTexel.x, 0.0)).rgb;\n` +
          `    vec3 n2 = texture2D(map, vMapUv - vec2(zTexel.x, 0.0)).rgb;\n` +
          `    vec3 n3 = texture2D(map, vMapUv + vec2(0.0, zTexel.y)).rgb;\n` +
          `    vec3 n4 = texture2D(map, vMapUv - vec2(0.0, zTexel.y)).rgb;\n` +
          `    float k = 0.11 * zSharpness;\n` +
          `    vec3 sharp = sampledDiffuseColor.rgb * (1.0 + 4.0 * k) - (n1 + n2 + n3 + n4) * k;\n` +
          `    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, clamp(sharp, 0.0, 1.0), clamp(zSharpness, 0.0, 1.0));\n` +
          `  }\n` +
          `  diffuseColor *= sampledDiffuseColor;\n` +
          `#endif`
        )
        .replace(
          '#include <opaque_fragment>',
          `float zLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));\n` +
          `vec3 zGray = vec3(zLum);\n` +
          `outgoingLight = mix(zGray, outgoingLight, max(0.0, zSaturation));\n` +
          `outgoingLight = (outgoingLight - vec3(0.5)) * zContrast + vec3(0.5);\n` +
          `float zLum2 = dot(max(outgoingLight, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722));\n` +
          `float zShadowMask = 1.0 - smoothstep(0.12, 0.55, zLum2);\n` +
          `float zHighlightMask = smoothstep(0.55, 1.05, zLum2);\n` +
          `outgoingLight += vec3(zShadows * 0.32 * zShadowMask);\n` +
          `outgoingLight += vec3(zHighlights * 0.28 * zHighlightMask);\n` +
          `outgoingLight *= zBrightness;\n` +
          `outgoingLight.r += zWarmth * 0.055;\n` +
          `outgoingLight.b -= zWarmth * 0.045;\n` +
          `outgoingLight = pow(max(outgoingLight, vec3(0.0)), vec3(1.0 / max(0.15, zGamma)));\n` +
          `#include <opaque_fragment>`
        );

      shader.userData = shader.userData || {};
      shader.userData.zusmoKind = kind;
      this.filterShaders[kind].add(shader);
      material.userData.zusmoShader = shader;
    };

    material.customProgramCacheKey = () => `zusmo-filter-v3-${kind}`;
    material.needsUpdate = true;
  }

  #syncFilterUniforms(kind) {
    const p = this.filterProfiles[kind] || DEFAULT_FILTER;
    for (const shader of this.filterShaders[kind]) {
      if (!shader?.uniforms) continue;
      if (shader.uniforms.zBrightness) shader.uniforms.zBrightness.value = p.brightness;
      if (shader.uniforms.zContrast) shader.uniforms.zContrast.value = p.contrast;
      if (shader.uniforms.zSaturation) shader.uniforms.zSaturation.value = p.saturation;
      if (shader.uniforms.zSharpness) shader.uniforms.zSharpness.value = p.sharpness;
      if (shader.uniforms.zShadows) shader.uniforms.zShadows.value = p.shadows;
      if (shader.uniforms.zHighlights) shader.uniforms.zHighlights.value = p.highlights;
      if (shader.uniforms.zGamma) shader.uniforms.zGamma.value = p.gamma;
      if (shader.uniforms.zWarmth) shader.uniforms.zWarmth.value = p.warmth;
    }
  }

  #applyTextures(object) {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() || 1;
    const aniso = this.quality === 'hd' ? Math.min(maxAniso, 8) : Math.min(maxAniso, 2);
    object.traverse?.((node) => {
      if (!node.isMesh) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        if (!mat) continue;
        for (const value of Object.values(mat)) {
          if (!value?.isTexture) continue;
          value.anisotropy = aniso;
          value.minFilter = THREE.LinearMipmapLinearFilter;
          value.magFilter = THREE.LinearFilter;
          value.generateMipmaps = true;
          value.needsUpdate = true;
        }
      }
    });
  }

  #applyShadowQuality() {
    const size = this.quality === 'hd' ? 1536 : 1024;
    for (const light of this.lights) {
      if (!light?.shadow?.mapSize) continue;
      if (light.shadow.mapSize.x !== size) {
        light.shadow.mapSize.set(size, size);
        light.shadow.map?.dispose?.();
        light.shadow.map = null;
      }
    }
  }

  resize(width, height) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render(scene, camera) {
    this.renderer.setRenderTarget(null);
    this.renderer.render(scene, camera);
  }
}
