import * as THREE from 'three';

export class GraphicsManager {
  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera = camera;
    this.quality = 'standard';
    this.sharpness = 0;
    this.trackedObjects = new Set();
    this.lights = [];
    this.target = new THREE.WebGLRenderTarget(16, 16, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true
    });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uResolution: { value: new THREE.Vector2(16, 16) },
        uStrength: { value: 0.5 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform vec2 uResolution;
        uniform float uStrength;
        varying vec2 vUv;
        void main(){
          vec2 px = 1.0 / max(uResolution, vec2(1.0));
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb;
          vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
          vec3 e = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb;
          vec3 w = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb;
          float k = 0.18 * uStrength;
          vec3 sharp = c * (1.0 + 4.0*k) - (n+s+e+w)*k;
          sharp = clamp(sharp, 0.0, 1.0);
          gl_FragColor = vec4(mix(c, sharp, 0.82), 1.0);
        }
      `
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
  }

  setLights(lights) {
    this.lights = lights;
    this.#applyShadowQuality();
  }

  trackObject(object) {
    if (!object) return;
    this.trackedObjects.add(object);
    this.#applyTextures(object);
  }

  untrackObject(object) { this.trackedObjects.delete(object); }

  setQuality(mode) {
    this.quality = mode === 'hd' ? 'hd' : 'standard';
    this.sharpness = this.quality === 'hd' ? 0.5 : 0;
    const maxRatio = this.quality === 'hd' ? 1.5 : 1.25;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
    this.trackedObjects.forEach((obj) => this.#applyTextures(obj));
    this.#applyShadowQuality();
    this.resize(window.innerWidth, window.innerHeight);
  }

  #applyTextures(object) {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() || 1;
    const aniso = this.quality === 'hd' ? Math.min(maxAniso, 8) : 1;
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
    const physical = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(Math.max(1, physical.x), Math.max(1, physical.y));
    this.postMaterial.uniforms.uResolution.value.copy(physical);
  }

  render(scene, camera) {
    if (this.quality !== 'hd') {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.postMaterial.uniforms.uStrength.value = this.sharpness;
    this.renderer.render(this.postScene, this.postCamera);
  }
}
