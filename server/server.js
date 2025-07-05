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

  // Function to emit user list to all clients
  const emitUserList = async () => {
    try {
      // Only emit online users
      const onlineUsers = Object.keys(users)
      const userList = onlineUsers.map(username => ({
        username: username,
        online: true
      }))
      
      io.emit("user-list", userList)
      console.log("📊 Online users:", onlineUsers.length)
    } catch (error) {
      console.error("❌ Error emitting user list:", error)
      io.emit("user-list", [])
    }
  }

  // Emit user list every 5 seconds to keep clients updated
  const userListInterval = setInterval(emitUserList, 5000)

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
        await emitUserList()
      } else if (user.password === password) {
        // Login existing user
        users[name] = { socketId: socket.id }
        username = name
        console.log("🔐 User logged in:", name)
        cb(true)
        await emitUserList()
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

  socket.on("logout", async () => {
    if (username) {
      console.log("👋 User logged out:", username)
      delete users[username]
      username = ""
      await emitUserList()
    }
  })

  socket.on("disconnect", async () => {
    if (username && users[username]) {
      console.log("🔌 User disconnected:", username)
      delete users[username]
      await emitUserList()
    }
    // Clear the interval when socket disconnects
    clearInterval(userListInterval)
  })

  socket.on("request-user-list", async () => {
    await emitUserList()
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
    const currentUser = req.query.currentUser || ""
    const onlineUsers = Object.keys(users)
    
    if (search.length > 0) {
      // Search in MongoDB for users matching the search term
      const dbUsers = await User.find({
        username: { $regex: search, $options: "i" }
      }).select("username -_id")
      
      // Get all matching users from database, excluding current user
      const allMatchingUsers = dbUsers
        .map(u => u.username)
        .filter(username => username !== currentUser)
      
      // Mark which users are online
      const usersWithStatus = allMatchingUsers.map(username => ({
        username: username,
        online: onlineUsers.includes(username)
      }))
      
      res.json(usersWithStatus)
    } else {
      // If no search term, return all online users except current user
      const filteredUsers = onlineUsers.filter(username => username !== currentUser)
      const usersWithStatus = filteredUsers.map(username => ({
        username: username,
        online: true
      }))
      res.json(usersWithStatus)
    }
  } catch (error) {
    console.error("Error searching users:", error)
    res.status(500).json({ error: "Failed to search users" })
  }
})

// Add recent chats endpoint
app.get("/api/recent-chats/:username", async (req, res) => {
  try {
    const username = req.params.username
    if (!username) {
      return res.status(400).json({ error: "Username required" })
    }

    // Get recent chat partners for the user
    const recentChats = await Message.aggregate([
      {
        $match: {
          $or: [
            { from: username },
            { to: username }
          ]
        }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$from", username] },
              "$to",
              "$from"
            ]
          },
          lastMessage: { $last: "$$ROOT" }
        }
      },
      {
        $sort: { "lastMessage.time": -1 }
      },
      {
        $limit: 20
      }
    ])

    const chatPartners = recentChats.map(chat => ({
      username: chat._id,
      lastMessage: chat.lastMessage.message,
      lastMessageTime: chat.lastMessage.time,
      unreadCount: 0 // You can implement unread count logic later
    }))

    res.json(chatPartners)
  } catch (error) {
    console.error("Error fetching recent chats:", error)
    res.status(500).json({ error: "Failed to fetch recent chats" })
  }
})

// Add endpoint to fetch all chats for a user
app.get("/api/user-chats/:username", async (req, res) => {
  try {
    const username = req.params.username
    if (!username) {
      return res.status(400).json({ error: "Username required" })
    }

    // Get all messages for the user (both sent and received)
    const allMessages = await Message.find({
      $or: [
        { from: username },
        { to: username }
      ]
    }).sort({ time: 1 })

    // Group messages by conversation partner
    const conversations = {}
    
    allMessages.forEach(message => {
      const partner = message.from === username ? message.to : message.from
      if (!conversations[partner]) {
        conversations[partner] = []
      }
      conversations[partner].push({
        id: message._id,
        from: message.from,
        to: message.to,
        message: message.message,
        time: message.time
      })
    })

    res.json(conversations)
  } catch (error) {
    console.error("Error fetching user chats:", error)
    res.status(500).json({ error: "Failed to fetch user chats" })
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
