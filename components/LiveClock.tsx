'use client'

import { useState, useEffect } from 'react'

function milTime() {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'America/Chicago',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  let hour = get('hour')
  if (hour === '24') hour = '00'
  return `${hour}${get('minute')}`
}

export default function LiveClock() {
  const [time, setTime] = useState(milTime)
  useEffect(() => {
    const id = setInterval(() => setTime(milTime()), 15000)
    return () => clearInterval(id)
  }, [])
  return <>{time}</>
}
