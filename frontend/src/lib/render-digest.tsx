"use client"

import React from "react"

/** Renders Trident digest text with basic **bold** segments (LLM output). */
export function RenderDigestText({ text }: { text: string }): React.ReactElement {
  const segments = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <div className="whitespace-pre-wrap break-words">
      {segments.map((seg, i) => {
        const m = /^\*\*([^*]+)\*\*$/.exec(seg)
        if (m) {
          return (
            <strong key={i} className="font-semibold text-slate-100">
              {m[1]}
            </strong>
          )
        }
        return <span key={i}>{seg}</span>
      })}
    </div>
  )
}
