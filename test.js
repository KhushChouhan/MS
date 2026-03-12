const fs = require('fs')
const readline = require('readline')
const { google } = require('googleapis')

const credentials = JSON.parse(fs.readFileSync('credentials.json'))

const { client_secret, client_id, redirect_uris } = credentials.web

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0],
)

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/drive.file'],
})

console.log('Authorize this app:', authUrl)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

rl.question('Enter code: ', (code) => {
  rl.close()

  oAuth2Client.getToken(code, (err, token) => {
    if (err) return console.error(err)

    fs.writeFileSync('token.json', JSON.stringify(token))

    console.log('Token saved')
  })
})
