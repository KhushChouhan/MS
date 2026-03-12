const fs = require("fs")
const readline = require("readline")
const { google } = require("googleapis")

// Load credentials
const credentials = JSON.parse(fs.readFileSync("credentials.json"))

const { client_secret, client_id, redirect_uris } =
  credentials.installed || credentials.web

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
)

// Generate auth URL
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/drive.file"],
})

console.log("\nAuthorize this app by visiting this url:\n")
console.log(authUrl)
console.log("\n")

// CLI input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

// Ask for code
rl.question("Paste the code here: ", async (code) => {
  try {
    const { tokens } = await oAuth2Client.getToken(code)

    oAuth2Client.setCredentials(tokens)

    fs.writeFileSync("token.json", JSON.stringify(tokens, null, 2))

    console.log("\n✅ Token saved to token.json\n")
  } catch (err) {
    console.error("Error retrieving token:", err)
  }

  rl.close()
})
