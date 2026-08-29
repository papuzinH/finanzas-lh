"use client"

import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react'

interface UseSpeechRecognitionOptions {
  lang?: string
  continuous?: boolean
  onResult?: (transcript: string) => void
  onError?: (error: string) => void
}

interface UseSpeechRecognitionReturn {
  isListening: boolean
  isSupported: boolean
  transcript: string
  finalTranscript: string
  startListening: () => void
  stopListening: () => void
  resetTranscript: () => void
}

// Tipos para SpeechRecognition
interface SpeechRecognitionResultList {
  [index: number]: {
    [index: number]: {
      transcript: string
      confidence: number
    }
    isFinal: boolean
    length: number
  }
  length: number
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
}

interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: ((event: Event) => void) | null
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event & { error: string }) => void) | null
  onend: ((event: Event) => void) | null
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Necesitás dar permiso al micrófono para usar voz',
  'no-speech': 'No escuché nada, intentá de nuevo',
  'audio-capture': 'No encontré un micrófono en tu dispositivo',
  'network': 'Sin conexión para reconocimiento de voz',
  'service-not-allowed': 'El servicio de voz no está disponible',
}

/**
 * ¿Este navegador tiene la API de reconocimiento de voz? Es un dato del
 * entorno, no estado de React: se lee, no se sincroniza con un efecto.
 */
export function haySoporteDeVoz(
  ventana: (Window & typeof globalThis) | undefined = typeof window === 'undefined' ? undefined : window,
): boolean {
  if (!ventana) return false
  return Boolean(ventana.SpeechRecognition || ventana.webkitSpeechRecognition)
}

/** El soporte no cambia durante la vida de la página: no hay a qué suscribirse. */
const sinSuscripcion = () => () => {}
const leerSoporte = () => haySoporteDeVoz()
/**
 * En el servidor se asume que sí, que es lo que este hook devolvía antes de
 * hidratar: así el botón de micrófono no aparece de golpe en el navegador que
 * sí lo soporta, que es el caso común.
 */
const soporteEnElServidor = () => true

export function useSpeechRecognition(
  options?: UseSpeechRecognitionOptions
): UseSpeechRecognitionReturn {
  const { lang = 'es-AR', continuous = false, onResult, onError } = options || {}

  const [isListening, setIsListening] = useState(false)
  const isSupported = useSyncExternalStore(sinSuscripcion, leerSoporte, soporteEnElServidor)
  const [transcript, setTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const interimTranscriptRef = useRef('')

  // Inicializar SpeechRecognition en client-side
  useEffect(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition() as SpeechRecognitionInstance
    recognition.lang = lang
    recognition.continuous = continuous
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsListening(true)
      setTranscript('')
      interimTranscriptRef.current = ''
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      interimTranscriptRef.current = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptSegment = event.results[i][0].transcript

        if (event.results[i].isFinal) {
          setFinalTranscript((prev) => prev + transcriptSegment)
          // Llamar callback cuando se complete un resultado final
          if (onResult) {
            onResult(finalTranscript + transcriptSegment)
          }
        } else {
          interimTranscriptRef.current += transcriptSegment
        }
      }

      setTranscript(interimTranscriptRef.current)
    }

    recognition.onerror = (event: Event & { error: string }) => {
      const error = event.error
      const errorMessage = ERROR_MESSAGES[error] || `Error de micrófono: ${error}`

      if (onError) {
        onError(errorMessage)
      }
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
  }, [lang, continuous, onResult, onError])

  const startListening = useCallback(() => {
    if (!recognitionRef.current || !isSupported) return

    try {
      recognitionRef.current.start()
    } catch (error) {
      // Recognition ya está activa
      console.debug('Speech recognition already active', error)
    }
  }, [isSupported])

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return

    try {
      recognitionRef.current.stop()
    } catch (error) {
      console.debug('Error stopping speech recognition', error)
    }
  }, [])

  const resetTranscript = useCallback(() => {
    setTranscript('')
    setFinalTranscript('')
    interimTranscriptRef.current = ''
  }, [])

  return {
    isListening,
    isSupported,
    transcript,
    finalTranscript,
    startListening,
    stopListening,
    resetTranscript,
  }
}
