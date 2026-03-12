const axios = require('axios')
const fs = require('fs')
const stream = require('stream')
const { google } = require('googleapis')
const { MongoClient } = require('mongodb')

const API_KEY = process.env.API_KEY
const RESOURCE_ID = process.env.RESOURCE_ID
const FOLDER_ID = process.env.FOLDER_ID

const LIMIT = 1000
const CHUNK_SIZE = 500000


const TOTAL_ROWS = 1000000

// MongoDB
const MONGO_URI =
  'mongodb+srv://khushchouhan9680_db_user:9680796461@cluster0.2xwtrmi.mongodb.net/?appName=Cluster0'

const client = new MongoClient(MONGO_URI)

async function connectDB() {
  await client.connect()
  return client.db('scraper')
}

async function getOffset(db) {
  const data = await db.collection('offset').findOne({ name: 'mandi' })
  return data ? data.offset : 0
}

async function saveOffset(db, offset) {
  await db
    .collection('offset')
    .updateOne(
      { name: 'mandi' },
      { $set: { offset: offset } },
      { upsert: true },
    )
}

// ⭐ frontend dashboard ke liye progress save
async function saveProgress(db, rows) {
  await db.collection('progress').updateOne(
    { name: 'scraper' },
    {
      $set: {
        rows: rows,
        total: TOTAL_ROWS,
        updatedAt: Date.now(),
      },
    },
    { upsert: true },
  )
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function uploadChunk(drive, pass, part) {
  try {
    const res = await drive.files.create({
      requestBody: {
        name: `mandi_dataset_part${part}.csv`,
        parents: [FOLDER_ID],
      },
      media: {
        mimeType: 'text/csv',
        body: pass,
      },
      fields: 'id',
    })

    console.log('Drive file created:', res.data.id)
  } catch (err) {
    console.log('Drive Upload Error:', err.message)
  }
}

async function start() {
  const db = await connectDB()

  let offset = await getOffset(db)

  // OAuth
  const credentials = JSON.parse(fs.readFileSync('credentials.json'))
  const token = JSON.parse(fs.readFileSync('token.json'))

  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0],
  )

  oAuth2Client.setCredentials(token)

  const drive = google.drive({
    version: 'v3',
    auth: oAuth2Client,
  })

  let part = 1
  let rowCount = 0

  let pass = new stream.PassThrough()

  uploadChunk(drive, pass, part)

  console.log('Upload started from offset:', offset)

  while (true) {
    const url = `https://api.data.gov.in/resource/${RESOURCE_ID}?api-key=${API_KEY}&format=json&limit=${LIMIT}&offset=${offset}`

    try {
      const res = await axios.get(url, { timeout: 120000 })

      const records = res.data.records

      if (!records || records.length === 0) break

      if (offset === 0) {
        const header = Object.keys(records[0]).join(',')
        pass.write(header + '\n')
      }

      const rows = records.map((r) => Object.values(r).join(',')).join('\n')

      pass.write(rows + '\n')

      offset += LIMIT
      rowCount += records.length

      await saveOffset(db, offset)

      // ⭐ dashboard update
      await saveProgress(db, offset)

      console.log('Uploaded rows:', offset)

      if (rowCount >= CHUNK_SIZE) {
        pass.end()

        console.log('Chunk completed:', part)

        part++
        rowCount = 0

        pass = new stream.PassThrough()

        uploadChunk(drive, pass, part)
      }

      await sleep(800)
    } catch (err) {
      if (err.response && err.response.status === 429) {
        console.log('Rate limit wait')
        await sleep(5000)
      } else if (err.code === 'ECONNRESET') {
        console.log('Connection reset retry')
        await sleep(3000)
      } else {
        console.log('Error:', err.message)
        await sleep(3000)
      }
    }
  }

  pass.end()

  console.log('Scraping complete')
}

start()
