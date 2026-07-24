import { getPayload } from 'payload'

import config from '../payload.config'

const requiredEnvironment = [
  'PAYLOAD_BOOTSTRAP_EMAIL',
  'PAYLOAD_BOOTSTRAP_NAME',
  'PAYLOAD_BOOTSTRAP_PASSWORD',
] as const

function bootstrapEnvironment() {
  const missing = requiredEnvironment.filter((name) => !process.env[name])
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    )
  }

  return {
    email: process.env.PAYLOAD_BOOTSTRAP_EMAIL!,
    name: process.env.PAYLOAD_BOOTSTRAP_NAME!,
    password: process.env.PAYLOAD_BOOTSTRAP_PASSWORD!,
  }
}

export function validateBootstrapPassword(password: string): void {
  const characterClasses = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
  if (
    password.length < 14 ||
    characterClasses.filter((pattern) => pattern.test(password)).length < 3
  ) {
    throw new Error(
      'Bootstrap password must be at least 14 characters and include at least three of: lowercase, uppercase, number, symbol.',
    )
  }
}

async function main() {
  const environment = bootstrapEnvironment()
  validateBootstrapPassword(environment.password)

  const payload = await getPayload({ config })
  const existingUsers = await payload.find({
    collection: 'users',
    limit: 1,
    overrideAccess: true,
  })

  if (existingUsers.totalDocs > 0) {
    throw new Error(
      'Administrator bootstrap refused: at least one Payload user already exists.',
    )
  }

  await payload.create({
    collection: 'users',
    data: {
      email: environment.email,
      name: environment.name,
      password: environment.password,
      role: 'admin',
    },
    overrideAccess: true,
  })

  payload.logger.info('Initial Payload administrator created successfully.')
}

if (process.argv[1]?.endsWith('bootstrap-admin.ts')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
