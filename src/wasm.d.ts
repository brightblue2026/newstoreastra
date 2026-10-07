// A .wasm import in the Worker entry (worker.ts) arrives already compiled.
declare module '*.wasm' {
  const compiled: WebAssembly.Module;
  export default compiled;
}
