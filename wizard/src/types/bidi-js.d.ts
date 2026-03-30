declare module 'bidi-js' {
  interface EmbeddingLevels {
    levels: Record<number, number>
    paragraphs: unknown[]
  }

  interface BidiInstance {
    getEmbeddingLevels(str: string, dir: 'ltr' | 'rtl'): EmbeddingLevels
    getReorderedString(str: string, levels: EmbeddingLevels): string
  }

  function bidiFactory(): BidiInstance
  export = bidiFactory
}
