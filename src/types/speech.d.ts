declare interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList
}

declare interface SpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  addEventListener(type: 'result', listener: (event: SpeechRecognitionEvent) => void): void
  addEventListener(type: 'end', listener: () => void): void
  removeEventListener(type: 'result', listener: (event: SpeechRecognitionEvent) => void): void
  removeEventListener(type: 'end', listener: () => void): void
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition
  new (): SpeechRecognition
}

declare interface Window {
  SpeechRecognition?: typeof SpeechRecognition
  webkitSpeechRecognition?: typeof SpeechRecognition
}
