import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class AssetLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.bufferCache = new Map();
  }

  async loadGLB(definition, onProgress = () => {}) {
    const url = new URL(definition.asset, document.baseURI).href;
    let buffer = this.bufferCache.get(url);
    if (!buffer) {
      buffer = await this.#fetchBuffer(url, definition.bytes || 0, onProgress);
      this.bufferCache.set(url, buffer);
    } else {
      onProgress({ loaded: definition.bytes || buffer.byteLength, total: definition.bytes || buffer.byteLength, cached: true });
    }

    const basePath = new URL('.', url).href;
    try {
      return await this.loader.parseAsync(buffer.slice(0), basePath);
    } catch (error) {
      this.bufferCache.delete(url);
      const e = new Error(`Could not parse ${definition.name || definition.id}: ${error?.message || error}`);
      e.cause = error;
      throw e;
    }
  }

  async #fetchBuffer(url, expectedBytes, onProgress) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('Asset timeout'), 120000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'force-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

      const headerTotal = Number(response.headers.get('content-length')) || 0;
      const total = headerTotal || expectedBytes || 0;
      if (!response.body) {
        const data = await response.arrayBuffer();
        onProgress({ loaded: data.byteLength, total: total || data.byteLength, cached: false });
        return data;
      }

      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        onProgress({ loaded, total: total || expectedBytes || loaded, cached: false });
      }

      const result = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return result.buffer;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`Timeout while loading ${url}`);
      throw new Error(`Failed to load ${url}: ${error?.message || error}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
