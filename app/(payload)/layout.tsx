import config from '@payload-config'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import type { ServerFunctionClient } from 'payload'
import React from 'react'

import '@payloadcms/next/css'
// After Payload's own stylesheet, so the theme variables it sets are the ones
// that win. See the file for why it stays shallow.
import './custom.css'
import { importMap } from './admin/importMap'

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({ ...args, config, importMap })
}

export default function PayloadLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RootLayout
      config={config}
      importMap={importMap}
      serverFunction={serverFunction}
    >
      {children}
    </RootLayout>
  )
}
