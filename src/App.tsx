import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useLottie } from 'lottie-react'
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import mascotIdle from './assets/mascot-idle.json'
import mascotTalking from './assets/mascot-talking.json'
import mascotCelebrate from './assets/mascot-celebrate.json'
import mascotThink from './assets/mascot-think.json'
import dollImage from '../Doll.webp'
import momoImage from '../momo.jpeg'
import './App.css'

type GameKey = 'color' | 'shapes' | 'clap'

type VoiceStatus = 'idle' | 'listening' | 'speaking'

type MascotState = 'idle' | 'talking' | 'celebrate' | 'think'

type SlideConfig = {
  key: string
  label: string
  content: ReactElement
}

const confettiPalette = ['#ff5252', '#ffeb3b', '#4caf50', '#29b6f6', '#7e57c2', '#ffa726']

const slideOrder = ['hero', 'color', 'shapes', 'clap', 'manners', 'safety', 'pledge'] as const
type SlideKey = (typeof slideOrder)[number]
const slideIndexForGame: Record<GameKey, number> = {
  color: slideOrder.indexOf('color'),
  shapes: slideOrder.indexOf('shapes'),
  clap: slideOrder.indexOf('clap'),
}

const ConfettiBurst = ({ seed }: { seed: number }) => {
  const pieces = useMemo(() => {
    if (!seed) return []
    return Array.from({ length: 60 }, (_, index) => ({
      id: `${seed}-${index}`,
      color: confettiPalette[index % confettiPalette.length],
      left: Math.random() * 100,
      delay: Math.random() * 0.35,
      duration: 2.6 + Math.random(),
      size: 10 + Math.random() * 14,
    }))
  }, [seed])

  if (!seed) return null

  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="confetti-piece"
          style={{
            left: `${piece.left}%`,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            width: `${piece.size}px`,
            height: `${piece.size * 0.35}px`,
          }}
        />
      ))}
    </div>
  )
}

const speechRecognition = (() => {
  const ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!ctor) return undefined
  const instance = new ctor()
  instance.lang = 'en-US'
  instance.continuous = false
  instance.interimResults = false
  return instance as SpeechRecognition
})()

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
const fallbackVoiceName = 'Microsoft Zira Desktop - English (United States)'

const voiceClips = {
  hero_intro: new URL('../voices/hero_intro.mp3', import.meta.url).href,
  hero_surprise_color: new URL('../voices/hero_surprise_color.mp3', import.meta.url).href,
  hero_surprise_shapes: new URL('../voices/hero_surprise_shapes.mp3', import.meta.url).href,
  hero_surprise_clap: new URL('../voices/hero_surprise_clap.mp3', import.meta.url).href,
  color_intro: new URL('../voices/color_intro.mp3', import.meta.url).href,
  color_success_red: new URL('../voices/color_success_red.mp3', import.meta.url).href,
  color_success_blue: new URL('../voices/color_success_blue.mp3', import.meta.url).href,
  color_success_green: new URL('../voices/color_sucess_green.mp3', import.meta.url).href,
  color_wrong: new URL('../voices/color_wrong.mp3', import.meta.url).href,
  shapes_intro: new URL('../voices/shapes_intro.mp3', import.meta.url).href,
  shapes_correct: new URL('../voices/shapes_correct.mp3', import.meta.url).href,
  shapes_wrong: new URL('../voices/shapes_wrong.mp3', import.meta.url).href,
  clap_intro: new URL('../voices/clap_intro.mp3', import.meta.url).href,
  clap_success: new URL('../voices/clap_sucess.mp3', import.meta.url).href,
  manners_please: new URL('../voices/manners_please.mp3', import.meta.url).href,
  manners_thankyou: new URL('../voices/manners_thankyou.mp3', import.meta.url).href,
  manners_sorry: new URL('../voices/manners_sorry.mp3', import.meta.url).href,
  safety_intro: new URL('../voices/safety_intro.mp3', import.meta.url).href,
} as const

type VoiceKey = keyof typeof voiceClips

type SpeechContent =
  | { key: VoiceKey; fallbackText?: string }
  | { text: string }

const useMascotAnimation = (state: MascotState) => {
  const animations: Record<MascotState, object> = useMemo(
    () => ({
      idle: mascotIdle,
      talking: mascotTalking,
      celebrate: mascotCelebrate,
      think: mascotThink,
    }),
    [],
  )

  const options = useMemo(
    () => ({
      animationData: animations[state],
      loop: state !== 'celebrate',
      autoplay: true,
    }),
    [animations, state],
  )

  const { View, setDirection, stop, goToAndStop } = useLottie(options, { height: 320 })

  useEffect(() => {
    if (state === 'celebrate') {
      setDirection(1)
      stop()
      goToAndStop(0, true)
      setTimeout(() => setDirection(1), 0)
    }
  }, [state, goToAndStop, setDirection, stop])

  return View
}

type UseSpeechResult = {
  status: VoiceStatus
  listen: () => void
  speak: (content: SpeechContent | SpeechContent[]) => Promise<void>
  stop: () => void
  setOnText: (handler: (value: string) => void) => void
}

const gamePromptVoiceKey: Record<GameKey, VoiceKey> = {
  color: 'color_intro',
  shapes: 'shapes_intro',
  clap: 'clap_intro',
}

const surpriseVoiceKey: Record<GameKey, VoiceKey> = {
  color: 'hero_surprise_color',
  shapes: 'hero_surprise_shapes',
  clap: 'hero_surprise_clap',
}

const colorTargets = ['red', 'blue', 'green'] as const
type ColorName = (typeof colorTargets)[number]

const colorSuccessVoiceKey: Record<ColorName, VoiceKey> = {
  red: 'color_success_red',
  blue: 'color_success_blue',
  green: 'color_success_green',
}

const useSpeech = (setMascotState: (state: MascotState) => void): UseSpeechResult => {
  const [status, setStatusState] = useState<VoiceStatus>('idle')
  const onTextRef = useRef<(value: string) => void>(() => {})
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const statusRef = useRef<VoiceStatus>('idle')
  const queueRef = useRef<SpeechContent[]>([])
  const processingRef = useRef(false)
  const currentResolveRef = useRef<(() => void) | null>(null)

  const setStatus = useCallback((value: VoiceStatus) => {
    statusRef.current = value
    setStatusState(value)
  }, [])

  const cleanupAudio = useCallback(() => {
    const current = audioRef.current
    if (current) {
      current.pause()
      current.onended = null
      current.onerror = null
    }
    audioRef.current = null
    currentResolveRef.current = null
    if (synth?.speaking) synth.cancel()
  }, [])

  const listen = useCallback(() => {
    if (!speechRecognition) return
    setStatus('listening')
    speechRecognition.start()
  }, [])

  const speakWithFallback = useCallback(
    (text?: string) =>
      new Promise<void>((resolve) => {
        const fallback = text?.trim()
        if (!fallback) {
          setStatus('idle')
          setMascotState('idle')
          currentResolveRef.current = null
          resolve()
          return
        }
        if (!synth) {
          setStatus('idle')
          setMascotState('idle')
          console.warn('No speech synthesis available for fallback narration.')
          currentResolveRef.current = null
          resolve()
          return
        }
        if (synth.speaking) synth.cancel()
        const utterance = new SpeechSynthesisUtterance(fallback)
        const voices = synth.getVoices()
        const voice = voices.find((item) => item.name === fallbackVoiceName) ?? voices[0]
        if (voice) utterance.voice = voice
        utterance.pitch = 1.05
        utterance.rate = 0.9
        utterance.volume = 0.9
        setMascotState('talking')
        setStatus('speaking')

        let settled = false
        const finalize = () => {
          if (settled) return
          settled = true
          setStatus('idle')
          setMascotState('idle')
          currentResolveRef.current = null
          resolve()
        }

        currentResolveRef.current = () => {
          if (synth.speaking) synth.cancel()
          finalize()
        }

        utterance.onend = finalize
        utterance.onerror = finalize
        synth.speak(utterance)
      }),
    [setMascotState, setStatus],
  )

  const playContent = useCallback(
    async (content: SpeechContent) => {
      const clipSrc = 'key' in content ? voiceClips[content.key] : undefined
      const fallbackText = 'text' in content ? content.text : content.fallbackText

      if (clipSrc) {
        cleanupAudio()

        await new Promise<void>((resolve) => {
          const audio = new Audio(clipSrc)
          audioRef.current = audio
          setMascotState('talking')
          setStatus('speaking')

          let interactionHandlersAttached = false
          let settled = false
          let resumeHandler: (() => void) | null = null

          const removeInteractionHandlers = () => {
            if (!interactionHandlersAttached || !resumeHandler) return
            document.removeEventListener('pointerdown', resumeHandler)
            document.removeEventListener('keydown', resumeHandler)
            interactionHandlersAttached = false
            resumeHandler = null
          }

          const finalize = () => {
            if (settled) return
            settled = true
            removeInteractionHandlers()
            cleanupAudio()
            setStatus('idle')
            setMascotState('idle')
            resolve()
          }

          audio.onended = finalize
          audio.onerror = () => {
            if (settled) return
            settled = true
            removeInteractionHandlers()
            cleanupAudio()
            speakWithFallback(fallbackText).then(resolve)
          }

          const attemptPlayback = () => {
            audio
              .play()
              .then(() => {
                currentResolveRef.current = finalize
              })
              .catch((error: unknown) => {
                const errorName =
                  error && typeof error === 'object' && 'name' in error
                    ? (error as { name: string }).name
                    : undefined

                if (errorName === 'NotAllowedError' || errorName === 'AbortError') {
                  if (!interactionHandlersAttached) {
                    interactionHandlersAttached = true
                    resumeHandler = () => {
                      removeInteractionHandlers()
                      attemptPlayback()
                    }
                    document.addEventListener('pointerdown', resumeHandler, { once: true })
                    document.addEventListener('keydown', resumeHandler, { once: true })
                    currentResolveRef.current = finalize
                    return
                  }
                }

                removeInteractionHandlers()
                if (settled) return
                settled = true
                cleanupAudio()
                speakWithFallback(fallbackText).then(resolve)
              })
          }

          currentResolveRef.current = finalize
          attemptPlayback()
        })
        return
      }

      await speakWithFallback(fallbackText)
    },
    [cleanupAudio, setMascotState, setStatus, speakWithFallback],
  )

  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const next = queueRef.current.shift()
        if (!next) continue
        // eslint-disable-next-line no-await-in-loop
        await playContent(next)
      }
    } finally {
      processingRef.current = false
      if (queueRef.current.length > 0) {
        queueMicrotask(() => {
          processQueue()
        })
      }
    }
  }, [playContent])

  const speak = useCallback(
    (input: SpeechContent | SpeechContent[]) => {
      const items = Array.isArray(input) ? input : [input]
      queueRef.current.push(...items)
      return processQueue()
    },
    [processQueue],
  )

  const stop = useCallback(() => {
    queueRef.current = []
    processingRef.current = false
    const resolver = currentResolveRef.current
    currentResolveRef.current = null
    if (resolver) {
      resolver()
    } else {
      cleanupAudio()
      setStatus('idle')
      setMascotState('idle')
    }
  }, [cleanupAudio, setMascotState, setStatus])

  useEffect(() => {
    if (!speechRecognition) return
    const handleResult = (event: SpeechRecognitionEvent) => {
      const text = event.results?.[0]?.[0]?.transcript
      if (text) onTextRef.current(text.toLowerCase())
      setStatus('idle')
    }
    const handleEnd = () => setStatus('idle')
    speechRecognition.addEventListener('result', handleResult)
    speechRecognition.addEventListener('end', handleEnd)
    return () => {
      speechRecognition.removeEventListener('result', handleResult)
      speechRecognition.removeEventListener('end', handleEnd)
    }
  }, [])

  const setOnText = useCallback((handler: (value: string) => void) => {
    onTextRef.current = handler
  }, [])

  useEffect(
    () => () => {
      cleanupAudio()
    },
    [cleanupAudio],
  )

  return { status, listen, speak, stop, setOnText }
}

const useColorClassifier = () => {
  const detectColor = useCallback(async (data: ImageData) => {
    const { data: pixels } = data
    if (!pixels?.length) return 'unknown'

    const totalPixels = pixels.length / 4
    const stride = Math.max(1, Math.floor(totalPixels / 4000))

    let hueX = 0
    let hueY = 0
    let sumSaturation = 0
    let sumValue = 0
    let considered = 0

    for (let i = 0; i < pixels.length; i += 4 * stride) {
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]

      const maxChannel = Math.max(r, g, b)
      const minChannel = Math.min(r, g, b)
      const delta = maxChannel - minChannel
      const value = maxChannel / 255

      if (value < 0.15 || delta === 0) continue

      const saturation = maxChannel === 0 ? 0 : delta / maxChannel
      if (saturation < 0.18) continue

      let hue = 0
      if (maxChannel === r) {
        hue = ((g - b) / delta) % 6
      } else if (maxChannel === g) {
        hue = (b - r) / delta + 2
      } else {
        hue = (r - g) / delta + 4
      }

      hue *= 60
      if (hue < 0) hue += 360

      const radians = (hue * Math.PI) / 180
      hueX += Math.cos(radians)
      hueY += Math.sin(radians)
      sumSaturation += saturation
      sumValue += value
      considered += 1
    }

    if (considered === 0) return 'unknown'

    const avgSaturation = sumSaturation / considered
    const avgValue = sumValue / considered

    if (avgSaturation < 0.25 || avgValue < 0.2) return 'unknown'

    let avgHue = Math.atan2(hueY / considered, hueX / considered) * (180 / Math.PI)
    if (Number.isNaN(avgHue)) return 'unknown'
    if (avgHue < 0) avgHue += 360

    if (avgHue >= 340 || avgHue < 20) return 'red'
    if (avgHue >= 70 && avgHue < 170) return 'green'
    if (avgHue >= 190 && avgHue < 255) return 'blue'

    return 'unknown'
  }, [])

  return detectColor
}

type ShapeMatch = {
  id: string
  label: string
  color: string
}

const shapes: ShapeMatch[] = [
  { id: 'circle', label: 'Circle', color: '#ff8a65' },
  { id: 'square', label: 'Square', color: '#4db6ac' },
  { id: 'triangle', label: 'Triangle', color: '#9575cd' },
]

const draggableShapeIds: ShapeMatch[] = [
  { id: 'circle', label: 'Circle', color: '#ffab91' },
  { id: 'square', label: 'Square', color: '#80cbc4' },
  { id: 'triangle', label: 'Triangle', color: '#b39ddb' },
]

const App = () => {
  const [mascotState, setMascotState] = useState<MascotState>('idle')
  const mascotView = useMascotAnimation(mascotState)
  const [activeGame, setActiveGame] = useState<GameKey>('color')
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const { status: voiceState, listen, speak, setOnText } = useSpeech(setMascotState)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const clapTimer = useRef<number | null>(null)
  const slideContainerRef = useRef<HTMLDivElement | null>(null)
  const slidesFrameRef = useRef<HTMLDivElement | null>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const colorDetector = useColorClassifier()
  const [colorIndex, setColorIndex] = useState(0)
  const [detectedColor, setDetectedColor] = useState('')
  const [shapeMatches, setShapeMatches] = useState<Record<string, string | null>>({
    circle: null,
    square: null,
    triangle: null,
  })
  const [clapDetected, setClapDetected] = useState(false)
  const [confettiSeed, setConfettiSeed] = useState(0)
  const [activeSlide, setActiveSlide] = useState(0)
  const colorAnnouncedRef = useRef<string | null>(null)
  const wrongColorRef = useRef<string | null>(null)
  const clapActiveRef = useRef(false)
  const segmenterRef = useRef<ImageSegmenter | null>(null)
  const narratedSlideRef = useRef<string | null>(null)
  const lastPromptedSlideRef = useRef<SlideKey | null>(null)
  const [momoPosition, setMomoPosition] = useState<{ x: number; y: number; ready: boolean }>({
    x: 0,
    y: 0,
    ready: false,
  })
  const blinkTimeout = useRef<number | null>(null)
  const [isBlinking, setIsBlinking] = useState(false)

  const syncGameWithSlide = useCallback(
    (index: number) => {
      const key = slideOrder[index]
      if ((key === 'color' && activeGame !== 'color') || (key === 'shapes' && activeGame !== 'shapes') || (key === 'clap' && activeGame !== 'clap')) {
        setActiveGame(key)
      }
    },
    [activeGame],
  )

  const updateMomoPosition = useCallback(() => {
    const container = slideContainerRef.current
    const slideEl = slideRefs.current[activeSlide]
    if (!container || !slideEl) return

    const containerRect = container.getBoundingClientRect()
    const slideRect = slideEl.getBoundingClientRect()

    const offsets: Record<SlideKey, { x: number; y: number }> = {
      hero: { x: slideRect.width * 0.08, y: slideRect.height * 0.12 },
      color: { x: slideRect.width * 0.8, y: slideRect.height * 0.2 },
      shapes: { x: slideRect.width * 0.78, y: slideRect.height * 0.38 },
      clap: { x: slideRect.width * 0.8, y: slideRect.height * 0.24 },
      manners: { x: slideRect.width * 0.12, y: slideRect.height * 0.16 },
      safety: { x: slideRect.width * 0.84, y: slideRect.height * 0.2 },
      pledge: { x: slideRect.width * 0.78, y: slideRect.height * 0.32 },
    }

    const key = slideOrder[activeSlide]
    const { x: offsetX, y: offsetY } = offsets[key]

    const targetX = slideRect.left + offsetX - containerRect.left
    const targetY = slideRect.top + offsetY - containerRect.top

    setMomoPosition((prev) => {
      if (prev.ready && Math.abs(prev.x - targetX) < 0.5 && Math.abs(prev.y - targetY) < 0.5) {
        return prev
      }
      return { x: targetX, y: targetY, ready: true }
    })
  }, [activeSlide])

  useEffect(() => {
    if (videoRef.current) videoRef.current.setAttribute('playsinline', 'true')
  }, [])

  useEffect(() => {
    const setupCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        setMediaStream(stream)
        mediaStreamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          const playPromise = videoRef.current.play()
          if (playPromise) playPromise.catch(() => undefined)
        }
      } catch (error) {
        speak({ text: 'I need camera and microphone to play with you' })
      }
    }
    setupCamera()
  }, [speak])

  useEffect(() => {
    const stream = mediaStreamRef.current
    const video = videoRef.current
    if (!stream || !video) return

    video.srcObject = stream
    video.muted = true
    video.playsInline = true

    const ensurePlayback = () => {
      const playPromise = video.play()
      if (playPromise) playPromise.catch(() => undefined)
    }

    if (video.readyState >= 2) {
      ensurePlayback()
    }

    video.addEventListener('loadedmetadata', ensurePlayback)
    video.addEventListener('canplay', ensurePlayback)

    return () => {
      video.removeEventListener('loadedmetadata', ensurePlayback)
      video.removeEventListener('canplay', ensurePlayback)
    }
  }, [mediaStream, activeSlide, activeGame])

  useEffect(() => {
    mediaStreamRef.current = mediaStream
  }, [mediaStream])

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (!mediaStream) return
    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048
    const dataArray = new Float32Array(analyser.fftSize)
    const source = audioContext.createMediaStreamSource(mediaStream)
    source.connect(analyser)
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => undefined)
    }

    const checkClap = () => {
      analyser.getFloatTimeDomainData(dataArray)
      let sum = 0
      for (let i = 0; i < dataArray.length; i += 1) sum += dataArray[i] ** 2
      const rms = Math.sqrt(sum / dataArray.length)
      if (rms > 0.08 && !clapActiveRef.current) {
        clapActiveRef.current = true
        setClapDetected(true)
        setMascotState('celebrate')
        speak({ key: 'clap_success', fallbackText: 'Great clapping. You rock! Keep that rhythm going!' })
        setConfettiSeed(Date.now())
        if (clapTimer.current) window.clearTimeout(clapTimer.current)
        clapTimer.current = window.setTimeout(() => {
          clapActiveRef.current = false
          setClapDetected(false)
          setMascotState('idle')
        }, 5000)
      }
      frameId = requestAnimationFrame(checkClap)
    }
    let frameId = requestAnimationFrame(checkClap)
    return () => {
      cancelAnimationFrame(frameId)
      audioContext.close()
      if (clapTimer.current) window.clearTimeout(clapTimer.current)
    }
  }, [mediaStream, speak, setMascotState])

  useEffect(() => {
    const initSegmenter = async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(
          'https://storage.googleapis.com/mediapipe-models',
        )
        segmenterRef.current = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
          },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
        })
        const canvas = canvasRef.current
        if (!canvas) return
        const context = canvas.getContext('2d')
        if (!context) return
        const render = async () => {
          if (!segmenterRef.current || !videoRef.current) {
            requestAnimationFrame(render)
            return
          }
          const result = await segmenterRef.current.segmentForVideo(videoRef.current, Date.now())
          const width = videoRef.current.videoWidth
          const height = videoRef.current.videoHeight
          canvas.width = width
          canvas.height = height
          context.drawImage(videoRef.current, 0, 0, width, height)
          if (result.categoryMask) {
            const maskSource = result.categoryMask as unknown as { toImageData: () => Promise<ImageData> }
            const mask = await maskSource.toImageData()
            const imageData = context.getImageData(0, 0, width, height)
            for (let i = 0; i < mask.data.length; i += 1) {
              const alpha = mask.data[i]
              imageData.data[i * 4 + 3] = Math.max(imageData.data[i * 4 + 3], alpha)
            }
            context.putImageData(imageData, 0, 0)
          }
          requestAnimationFrame(render)
        }
        render()
      } catch {
        console.warn('Segmenter unavailable')
      }
    }
    initSegmenter()
  }, [])

  useEffect(() => {
    updateMomoPosition()
  }, [activeSlide, updateMomoPosition])

  useEffect(() => {
    const handleResize = () => updateMomoPosition()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [updateMomoPosition])

  useEffect(() => {
    const slidesNode = slidesFrameRef.current
    if (!slidesNode) return undefined
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.propertyName === 'transform') updateMomoPosition()
    }
    slidesNode.addEventListener('transitionend', handleTransitionEnd)
    return () => {
      slidesNode.removeEventListener('transitionend', handleTransitionEnd)
    }
  }, [updateMomoPosition])

  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 2500
      if (blinkTimeout.current) window.clearTimeout(blinkTimeout.current)
      blinkTimeout.current = window.setTimeout(() => {
        setIsBlinking(true)
        window.setTimeout(() => {
          setIsBlinking(false)
          scheduleBlink()
        }, 180)
      }, delay)
    }

    scheduleBlink()
    return () => {
      if (blinkTimeout.current) window.clearTimeout(blinkTimeout.current)
    }
  }, [])

  const describeGame = useCallback((game: GameKey) => {
    const messages: Record<GameKey, string> = {
      color:
        'Let us play Color Quest. Hold a bright toy nice and still in front of the camera so I can spot the color.',
      shapes: 'Shape Parade time. Drag the chunky shape into the glowing box that shows the same word.',
      clap: 'Ready for the Clap Party. Clap softly, then louder, so I can cheer with you.',
    }
    return messages[game]
  }, [])

  const promptGame = useCallback(() => {
    const fallback = describeGame(activeGame)
    speak({ key: gamePromptVoiceKey[activeGame], fallbackText: fallback })
  }, [activeGame, describeGame, speak])

  const handleSpeech = useCallback(
    (text: string) => {
      if (text.includes('color')) setActiveGame('color')
      if (text.includes('shape')) setActiveGame('shapes')
      if (text.includes('clap')) setActiveGame('clap')
      if (text.includes('help')) {
        setMascotState('think')
        speak({ text: `Let's try again. ${describeGame(activeGame)}` })
      }
    },
    [activeGame, describeGame, speak],
  )

  useEffect(() => {
    setOnText(handleSpeech)
  }, [handleSpeech, setOnText])

  useEffect(() => {
    const key = slideOrder[activeSlide]
    if (key === 'hero' && narratedSlideRef.current !== key) {
      narratedSlideRef.current = key
      speak({
        key: 'hero_intro',
        fallbackText: 'Hey there! I’m Momo, your learning buddy. Let’s explore colors, shapes, and super-safe habits together!',
      })
    }
    if (key === 'manners' && narratedSlideRef.current !== key) {
      narratedSlideRef.current = key
      speak([
        {
          key: 'manners_please',
          fallbackText: 'We say “please” when we are asking kindly—for a toy, a turn, or a yummy treat.',
        },
        {
          key: 'manners_thankyou',
          fallbackText: 'We say “thank you” to show we are grateful when someone shares or helps us.',
        },
        {
          key: 'manners_sorry',
          fallbackText: 'We say “sorry” when we make a mistake, like bumping a friend, and we want to make things right.',
        },
      ])
    }
    if (key === 'safety' && narratedSlideRef.current !== key) {
      narratedSlideRef.current = key
      speak({
        key: 'safety_intro',
        fallbackText:
          'This is the caring doll. See the green Good bubble? That shows safe touches, like a hug you like. The red No bubble shows bad touches that feel yucky. If that happens, say “No”, move away, and tell a grown up you trust.',
      })
    }
    if (key !== 'manners' && key !== 'safety' && key !== 'hero') narratedSlideRef.current = null
  }, [activeSlide, speak])

  useEffect(() => {
    syncGameWithSlide(activeSlide)
  }, [activeSlide, syncGameWithSlide])

  useEffect(() => {
    const key = slideOrder[activeSlide]
    if ((key === 'color' || key === 'shapes' || key === 'clap') && activeGame === key && lastPromptedSlideRef.current !== key) {
      lastPromptedSlideRef.current = key
      promptGame()
    }
    if (key !== 'color' && key !== 'shapes' && key !== 'clap') {
      lastPromptedSlideRef.current = key
    }
  }, [activeSlide, activeGame, promptGame])

  useEffect(() => {
    if (activeGame !== 'color') return
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const context = canvas.getContext('2d')
    if (!context) return
    let frameId = 0
    const tick = async () => {
      if (video.readyState < 2) {
        frameId = requestAnimationFrame(tick)
        return
      }
      const width = video.videoWidth
      const height = video.videoHeight
      canvas.width = width
      canvas.height = height
      context.drawImage(video, 0, 0, width, height)
      const region = context.getImageData(width / 3, height / 3, width / 3, height / 3)
      const color = await colorDetector(region)
      setDetectedColor(color)
      const target = colorTargets[colorIndex] ?? null
      if (color !== 'unknown' && color === target && colorAnnouncedRef.current !== target) {
        colorAnnouncedRef.current = target
        wrongColorRef.current = null
        setMascotState('celebrate')
        speak({ key: colorSuccessVoiceKey[target], fallbackText: `I see ${target}. Great job.` })
        window.setTimeout(() => setMascotState('idle'), 3000)
        setConfettiSeed(Date.now())
        setColorIndex((prev) => Math.min(prev + 1, colorTargets.length))
      } else if (
        color !== 'unknown' &&
        target &&
        color !== target &&
        wrongColorRef.current !== color &&
        colorAnnouncedRef.current !== target
      ) {
        wrongColorRef.current = color
        speak({
          key: 'color_wrong',
          fallbackText: `Uh-oh, that's ${color}. It's okay, let's try to find ${target}!`,
        })
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => {
      colorAnnouncedRef.current = null
      cancelAnimationFrame(frameId)
    }
  }, [activeGame, colorDetector, speak, colorIndex])

  useEffect(() => {
    colorAnnouncedRef.current = null
    wrongColorRef.current = null
  }, [colorIndex, activeGame])

  const handleDrop = (shapeId: string, targetId: string) => {
    setShapeMatches((prev) => ({ ...prev, [shapeId]: targetId }))
    if (shapeId === targetId) {
      setMascotState('celebrate')
      speak({ key: 'shapes_correct', fallbackText: `Nice matching. ${shapeId} fits perfectly.` })
      setTimeout(() => setMascotState('idle'), 3000)
      setConfettiSeed(Date.now())
    } else {
      setMascotState('think')
      speak({ key: 'shapes_wrong', fallbackText: 'Almost. Try a different slot.' })
      setTimeout(() => setMascotState('idle'), 3000)
    }
  }

  const resetShapes = () => {
    setShapeMatches({ circle: null, square: null, triangle: null })
    setMascotState('idle')
  }

  const colorPrompt = colorIndex >= colorTargets.length
    ? 'Amazing. You found all the colors!'
    : `Show me something ${colorTargets[colorIndex]}`

  const renderColorGame = () => (
    <div className="game game-camera">
      <div className="camera-feed">
        {!mediaStream && <div className="camera-placeholder">🎥 Wave hello when you can see yourself here!</div>}
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} className="color-capture" aria-hidden="true" />
      </div>
      <p className="prompt">{colorPrompt}</p>
      <p className="detected">Detected: {detectedColor || '...'}</p>
      <button type="button" onClick={promptGame} className="action">
        Repeat clue
      </button>
    </div>
  )

  const renderClapGame = () => (
    <div className="game game-clap">
      <div className={`clap-indicator ${clapDetected ? 'active' : ''}`}>👏</div>
      <p className="prompt">Clap so I can celebrate with you.</p>
      <button type="button" onClick={promptGame} className="action">
        Repeat clue
      </button>
    </div>
  )

  const renderShapeGame = () => (
    <div className="game game-shapes">
      <p className="prompt">Pull a shape from the toy shelf and pop it into the matching box.</p>
      <div className="shape-board">
        {shapes.map((shape) => (
          <div
            key={shape.id}
            className={`slot slot-${shape.id}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const shapeId = event.dataTransfer.getData('shapeId')
              if (!shapeId) return
              handleDrop(shapeId, shape.id)
            }}
          >
            <svg viewBox="0 0 100 100">
              {shape.id === 'circle' && <circle cx="50" cy="50" r="40" stroke={shape.color} fill="none" strokeWidth="8" />}
              {shape.id === 'square' && <rect x="15" y="15" width="70" height="70" stroke={shape.color} fill="none" strokeWidth="8" rx="12" />}
              {shape.id === 'triangle' && <polygon points="50,10 90,90 10,90" stroke={shape.color} fill="none" strokeWidth="8" />}
            </svg>
            <span>{shape.label}</span>
          </div>
        ))}
      </div>
      <div className="shape-drawer">
        {draggableShapeIds.map((shape) => (
          <button
            key={shape.id}
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('shapeId', shape.id)
            }}
            onDragOver={(event) => event.preventDefault()}
            className={`shape-piece ${shapeMatches[shape.id] === shape.id ? 'matched' : ''}`}
            style={{ backgroundColor: shape.color }}
          >
            {shape.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={resetShapes} className="action">
        Reset board
      </button>
      <button type="button" onClick={promptGame} className="action">
        Repeat clue
      </button>
    </div>
  )

  const slides: SlideConfig[] = [
      {
        key: 'hero',
        label: 'Meet Momo',
        content: (
          <header className="hero">
            <div className="hero-illustration">
              <div className="cloud cloud-left" />
              <div className="cloud cloud-right" />
              <div className="twinkle twinkle-one" />
              <div className="twinkle twinkle-two" />
              <div className="twinkle twinkle-three" />
              <div className="rainbow-arch" />
              <div className="hero-mascot">{mascotView}</div>
              <div className="balloon balloon-one" />
              <div className="balloon balloon-two" />
            </div>
            <div className="hero-copy">
              <span className="hero-badge">Momo the Magic Panda</span>
              <h1>EduToon Learning Carnival</h1>
              <p>
                Sing, clap, and discover colors with a silly sidekick who reacts to every giggle. Your
                voice, hands, and favorite toys turn into learning adventures.
              </p>
              <div className="hero-actions">
                <button type="button" onClick={listen} disabled={!speechRecognition} className="bubble-button">
                  <span className="bubble-icon" aria-hidden="true">
                    🎤
                  </span>
                  Talk to Momo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const games: GameKey[] = ['color', 'shapes', 'clap']
                    const chosen = games[Math.floor(Math.random() * games.length)]
                    setActiveGame(chosen)
                    setActiveSlide(slideIndexForGame[chosen])
                    speak({
                      key: surpriseVoiceKey[chosen],
                      fallbackText: `Surprise! ${describeGame(chosen)}`,
                    })
                  }}
                  className="bubble-button secondary"
                >
                  <span className="bubble-icon" aria-hidden="true">
                    🌈
                  </span>
                  Surprise me
                </button>
              </div>
              <div className="hero-status">
                <span className={`status-light status-${voiceState}`} />
                <strong>Voice status:</strong> {voiceState}
              </div>
            </div>
          </header>
        ),
      },
      {
        key: 'color',
        label: 'Color Quest',
        content: (
          <section className="activity-slide">
            <div className="playground-frame">
              <div className="frame-top">
                <div className="frame-bow left" />
                <div className="frame-title">Color Quest</div>
                <div className="frame-bow right" />
              </div>
              <div className="frame-body">{renderColorGame()}</div>
              <div className="frame-waves" />
            </div>
            <aside className="play-tips">
              <h3>How to play</h3>
              <ul>
                <li>Hold one bright toy close to the camera and keep smiling still.</li>
                <li>Try red, blue, then green to finish the rainbow.</li>
                <li>If Momo forgets, tap “Repeat clue”.</li>
              </ul>
            </aside>
          </section>
        ),
      },
      {
        key: 'shapes',
        label: 'Shape Parade',
        content: (
          <section className="activity-slide">
            <div className="playground-frame">
              <div className="frame-top">
                <div className="frame-bow left" />
                <div className="frame-title">Shape Parade</div>
                <div className="frame-bow right" />
              </div>
              <div className="frame-body">{renderShapeGame()}</div>
              <div className="frame-waves" />
            </div>
            <aside className="play-tips">
              <h3>How to play</h3>
              <ul>
                <li>Pinch a shape from the toy shelf below and drag it up.</li>
                <li>Match the word on the glowing box to the toy you picked.</li>
                <li>Try all three shapes to start a confetti dance.</li>
              </ul>
            </aside>
          </section>
        ),
      },
      {
        key: 'clap',
        label: 'Clap Party',
        content: (
          <section className="activity-slide">
            <div className="playground-frame">
              <div className="frame-top">
                <div className="frame-bow left" />
                <div className="frame-title">Clap Party</div>
                <div className="frame-bow right" />
              </div>
              <div className="frame-body">{renderClapGame()}</div>
              <div className="frame-waves" />
            </div>
            <aside className="play-tips">
              <h3>How to play</h3>
              <ul>
                <li>Clap gently at first, then louder until Momo cheers.</li>
                <li>Dance while you clap for extra silliness.</li>
                <li>If you need another clue, tap “Repeat clue”.</li>
              </ul>
            </aside>
          </section>
        ),
      },
      {
        key: 'manners',
        label: 'Manners',
        content: (
          <section className="manners">
            <h2>Momo&apos;s Kind Words</h2>
            <p>Momo teaches gentle words that make friends smile.</p>
            <div className="manners-cards">
              <article className="manners-card please">
                <h3>Please</h3>
                <p>“Please” is a magic word. We say it when we are asking for a toy or a tasty snack.</p>
              </article>
              <article className="manners-card thankyou">
                <h3>Thank you</h3>
                <p>After a friend shares, we say “Thank you!” and give a happy grin.</p>
              </article>
              <article className="manners-card sorry">
                <h3>Sorry</h3>
                <p>Oops! If we bump someone, we say “Sorry” and give a gentle hug.</p>
              </article>
            </div>
          </section>
        ),
      },
      {
        key: 'safety',
        label: 'Stay Safe',
        content: (
          <section className="safety">
            <h2>Good Touch, Bad Touch</h2>
            <p>Momo and the Caring Doll show us how to keep our bodies safe.</p>
            <div className="safety-content">
              <div className="safety-doll-wrapper">
                <img src={dollImage} alt="Friendly doll teaching safe touch" className="safety-doll" />
                <span className="touch-marker good head" aria-hidden="true">
                  Good
                </span>
                <span className="touch-marker good hand" aria-hidden="true">
                  Good
                </span>
                <span className="touch-marker bad chest" aria-hidden="true">
                  No!
                </span>
                <span className="touch-marker bad belly" aria-hidden="true">
                  No!
                </span>
                <span className="touch-marker bad knee" aria-hidden="true">
                  No!
                </span>
              </div>
              <ul>
                <li>
                  <strong>Good touch:</strong> A cozy hug from family or a high-five from a friend when you say it
                  is okay.
                </li>
                <li>
                  <strong>Bad touch:</strong> Any touch that makes you feel yucky, scared, or hurts. We say “No!” and
                  find a grown-up we trust.
                </li>
                <li>
                  <strong>Safe words:</strong> Tell a parent, teacher, or helper if something feels wrong. You are
                  brave and loved.
                </li>
              </ul>
            </div>
          </section>
        ),
      },
      {
        key: 'pledge',
        label: 'Giggle Pledge',
        content: (
          <footer className="storybook">
            <div className="storybook-scribbles" aria-hidden="true">
              <span className="scribble star" />
              <span className="scribble note" />
              <span className="scribble heart" />
            </div>
            <h2>The Giggle Pledge</h2>
            <p>
              Every giggle sparks a new adventure. Speak kindly, try bravely, and your cartoon classroom will sparkle
              with songs, shapes, and cheers.
            </p>
          </footer>
        ),
      },
    ]

  const goToNextSlide = () => {
    setActiveSlide((prev) => {
      const next = (prev + 1) % slideOrder.length
      syncGameWithSlide(next)
      return next
    })
  }

  const goToPrevSlide = () => {
    setActiveSlide((prev) => {
      const next = (prev - 1 + slideOrder.length) % slideOrder.length
      syncGameWithSlide(next)
      return next
    })
  }

  return (
    <div className="app" ref={slideContainerRef}>
      <ConfettiBurst seed={confettiSeed} />
      <div className="momo-avatar" style={{ opacity: momoPosition.ready ? 1 : 0, transform: `translate(${momoPosition.x}px, ${momoPosition.y}px)` }}>
        <div
          className={`momo-image ${isBlinking ? 'blinking' : ''}`}
          style={{ backgroundImage: `url(${momoImage})` }}
          role="img"
          aria-label="Momo the guide"
        />
      </div>
      <div className="slide-view">
        <div className="slides" ref={slidesFrameRef} style={{ transform: `translateX(-${activeSlide * 100}%)` }}>
          {slides.map((slide, index) => (
            <div
              key={slide.key}
              className="slide"
              ref={(node) => {
                slideRefs.current[index] = node
              }}
            >
              <div className={`slide-content ${slide.key}-slide`}>{slide.content}</div>
            </div>
          ))}
        </div>
        <div className="slide-controls">
          <button type="button" className="arrow-button prev" onClick={goToPrevSlide} aria-label="Previous slide">
            ◀
          </button>
          <div className="slide-dots">
            {slides.map((slide, index) => (
              <button
                key={slide.key}
                type="button"
                className={`dot ${index === activeSlide ? 'active' : ''}`}
                onClick={() => {
                  syncGameWithSlide(index)
                  setActiveSlide(index)
                }}
                aria-label={`Go to ${slide.label}`}
              />
            ))}
          </div>
          <button type="button" className="arrow-button next" onClick={goToNextSlide} aria-label="Next slide">
            ▶
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
