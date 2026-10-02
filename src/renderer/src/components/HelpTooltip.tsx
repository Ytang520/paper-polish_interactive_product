import React from 'react'

export default function HelpTooltip({ text }: { text: string }) {
  const [show, setShow] = React.useState(false)
  return (
    <span
      className="relative inline-flex items-center ml-1"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="inline-block w-3 h-3" />
      {show && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-[11px] text-white bg-surface-800 rounded-md shadow-lg whitespace-nowrap z-50 pointer-events-none"
          style={{ animation: 'fadeIn 0.15s ease-in' }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
