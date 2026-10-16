import { useId, useRef, useState, type DragEvent } from 'react'

import { Button, IconClose, IconFilm, IconUpload } from '@/components/common'
import { cx } from '@/utils/cx'

import s from './Upload.module.css'

interface VideoDropzoneProps {
  label: string
  file: File | null
  onFile: (file: File | null) => void
  disabled?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function isVideo(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mkv|mov|webm|avi)$/i.test(file.name)
}

export function VideoDropzone({ label, file, onFile, disabled = false }: VideoDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [over, setOver] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)

  const accept = (candidate: File | undefined) => {
    if (!candidate) return
    if (!isVideo(candidate)) {
      setRejected(`"${candidate.name}" is not a video file.`)
      return
    }
    setRejected(null)
    onFile(candidate)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setOver(false)
    if (disabled) return
    accept(e.dataTransfer.files[0])
  }

  return (
    <div
      className={cx(s.dropzone, over && s.over, file && s.filled)}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={() => {
        if (!disabled && !file) inputRef.current?.click()
      }}
      role="group"
      aria-label={label}
    >
      <span className={s.dropzoneLabel}>{label}</span>
      <input
        ref={inputRef}
        id={inputId}
        className={s.hiddenInput}
        type="file"
        accept="video/*,.mp4,.mkv,.mov"
        disabled={disabled}
        onChange={(e) => {
          accept(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {file ? (
        <>
          <IconFilm size={26} className={s.dropzoneIcon} />
          <span className={s.fileName}>{file.name}</span>
          <span className={s.fileMeta}>
            {formatBytes(file.size)}
            {file.type ? ` · ${file.type}` : ''}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation()
              onFile(null)
            }}
          >
            <IconClose size={14} />
            Remove
          </Button>
        </>
      ) : (
        <>
          <IconUpload size={26} className={s.dropzoneIcon} />
          <span className={s.dropzoneTitle}>Drop video here</span>
          <span>
            or <span className={s.browse}>browse files</span>
          </span>
          <span className={s.fileMeta}>MP4 (H.264) recommended</span>
        </>
      )}
      {rejected && <span className={s.error}>{rejected}</span>}
    </div>
  )
}
