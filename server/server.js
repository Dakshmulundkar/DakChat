// Handle environment variables for both local and deployment
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: require("path").join(__dirname, ".env") })
}
const express = require("express")
const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)
const path = require("path")
const mongoose = require("mongoose")

// Use environment variable for MongoDB connection with fallback
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.DATABASE_URL ||
  "mongodb://localhost:27017/dakchat"

if (!MONGO_URI) {
  console.error("❌ No MongoDB URI found in environment variables")
  console.log("💡 Make sure MONGO_URI is set in your environment")
  process.exit(1)
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB successfully")
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error)
    process.exit(1)
  })

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
})

const messageSchema = new mongoose.Schema({
  from: String,
  to: String,
  message: String,
  time: { type: Date, default: Date.now },
})

const User = mongoose.model("User", userSchema)
const Message = mongoose.model("Message", messageSchema)

const users = {} // { username: { socketId } }

app.use(express.static(path.join(__dirname, "../client")))

io.on("connection", (socket) => {
  let username = ""
  console.log("🔌 New client connected:", socket.id)

  socket.on("set-username", async (data, cb) => {
    try {
      const { name, password } = data

      if (!name || !password) {
        return cb(false)
      }

      let user = await User.findOne({ username: name })

      if (!user) {
        // Register new user
        user = new User({ username: name, password })
        await user.save()
        users[name] = { socketId: socket.id }
        username = name
        console.log("👤 New user registered:", name)
        cb(true)
        io.emit("user-list", Object.keys(users))
      } else if (user.password === password) {
        // Login existing user
        users[name] = { socketId: socket.id }
        username = name
        console.log("🔐 User logged in:", name)
        cb(true)
        io.emit("user-list", Object.keys(users))
      } else {
        console.log("❌ Wrong password for user:", name)
        cb("wrong")
      }
    } catch (error) {
      console.error("❌ Error in set-username:", error)
      cb(false)
    }
  })

  socket.on("send-message", async ({ to, message }) => {
    try {
      if (!username || !to || !message) {
        return
      }

      const target = users[to]
      const msgObj = {
        from: username,
        to,
        message: message.trim(),
        time: new Date(),
      }

      // Save message to database
      await new Message(msgObj).save()
      console.log("💬 Message saved:", `${username} -> ${to}`)

      // Send to target user if online
      if (target && target.socketId) {
        io.to(target.socketId).emit("receive-message", msgObj)
      }

      // Also send back to sender for confirmation
      socket.emit("receive-message", msgObj)
    } catch (error) {
      console.error("❌ Error sending message:", error)
    }
  })

  socket.on("logout", () => {
    if (username) {
      console.log("👋 User logged out:", username)
      delete users[username]
      username = ""
      io.emit("user-list", Object.keys(users))
    }
  })

  socket.on("disconnect", () => {
    if (username && users[username]) {
      console.log("🔌 User disconnected:", username)
      delete users[username]
      io.emit("user-list", Object.keys(users))
    }
  })

  socket.on("get-history", async ({ withUser }, cb) => {
    try {
      if (!username || !withUser) {
        return cb([])
      }

      const history = await Message.find({
        $or: [
          { from: username, to: withUser },
          { from: withUser, to: username },
        ],
      })
        .sort({ time: 1 })
        .limit(100) // Limit to last 100 messages

      console.log("📜 Chat history retrieved:", `${username} <-> ${withUser} (${history.length} messages)`)
      cb(history)
    } catch (error) {
      console.error("❌ Error getting history:", error)
      cb([])
    }
  })
})

// Add user search endpoint
app.get("/api/users", async (req, res) => {
  try {
    const search = req.query.search || ""
    // Find users whose username contains the search string (case-insensitive)
    const users = await User.find({
      username: { $regex: search, $options: "i" }
    }).select("username -_id")
    res.json(users.map(u => u.username))
  } catch (error) {
    res.status(500).json({ error: "Failed to search users" })
  }
})

const PORT = process.env.PORT || 3000

http.listen(PORT, () => {
  console.log("🚀 DakChat server running at http://localhost:" + PORT)
  console.log("📊 Environment:", process.env.NODE_ENV || "development")
})

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down server...")

  try {
    await mongoose.connection.close()
    console.log("✅ MongoDB connection closed")
  } catch (error) {
    console.error("❌ Error closing MongoDB connection:", error)
  }

  process.exit(0)
})

process.on("SIGTERM", async () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...")

  try {
    await mongoose.connection.close()
    console.log("✅ MongoDB connection closed")
  } catch (error) {
    console.error("❌ Error closing MongoDB connection:", error)
  }

  process.exit(0)
})
