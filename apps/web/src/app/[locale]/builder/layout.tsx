import React from 'react'
import { LoggerInit } from '@/components/logger-init'

export default function BuilderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <LoggerInit />
      {children}
    </>
  )
}