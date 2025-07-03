// Socket.IO connection
const socket = io()
let myUsername = ""
let currentChat = ""
let users = []
let recentChats = JSON.parse(localStorage.getItem("recentChats") || "[]")

const $ = (id) => document.getElementById(id)

class DakChat {
  constructor() {
    this.socket = socket
    this.myUsername = ""
    this.currentChat = ""
    this.users = []
    this.recentChats = JSON.parse(localStorage.getItem("recentChats") || "[]")
    this.isTyping = false

    this.initializeElements()
    this.bindEvents()
    this.setupSocketListeners()
    this.showLoginScreen()
  }

  initializeElements() {
    // Screens
    this.loginScreen = $("login")
    this.chatScreen = $("main-chat")

    // Login elements
    this.usernameInput = $("username")
    this.passwordInput = $("password")
    this.loginError = $("login-error")

    // Chat elements
    this.sidebar = $("sidebar")
    this.currentUserElement = $("current-user")
    this.userCountElement = $("user-count")
    this.userListElement = $("user-list")
    this.searchInput = $("search")
    this.chatHeader = $("chat-header")
    this.chatUsername = $("chat-username")
    this.chatArea = $("chat-area")
    this.chatInput = $("chat-input")
    this.messageInput = $("message")
    this.sendBtn = $("send-btn")
    this.emojiBtn = $("emoji-btn")
    this.emojiPicker = $("emoji-picker")
    this.charCount = $("char-count")
    this.backArrow = $("back-arrow")
    this.logoutBtn = $("logout-btn")

    // Toast container
    this.toastContainer = $("toast-container")
  }

  bindEvents() {
    // Login
    this.usernameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.handleLogin()
    })

    this.passwordInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.handleLogin()
    })

    // Message input
    this.messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        this.sendMessage()
      }
    })

    this.messageInput.addEventListener("input", () => {
      this.updateCharCount()
      this.handleTyping()
    })

    // Close emoji picker when clicking outside
    document.addEventListener("click", (e) => {
      if (!this.emojiPicker.contains(e.target) && e.target !== this.emojiBtn) {
        this.emojiPicker.style.display = "none"
      }
    })

    // Add back button event for mobile
    this.backArrow.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        const chatAreaContainer = $("chat-area-container")
        if (chatAreaContainer) chatAreaContainer.classList.remove("active")
        this.sidebar.classList.add("active")
        this.sidebar.style.display = "flex"
      }
    })
  }

  setupSocketListeners() {
    this.socket.on("connect", () => {
      this.hideLoadingScreen()
      this.showToast("Connected to server", "success")
    })

    this.socket.on("disconnect", () => {
      this.showToast("Connection lost", "error")
    })

    this.socket.on("connect_error", (error) => {
      console.error("Connection error:", error)
      this.hideLoadingScreen()
      this.showLoginScreen()
      this.showToast("Failed to connect to server", "error")
    })

    this.socket.on("user-list", (userList) => {
      this.users = userList.filter((u) => u !== this.myUsername)
      this.updateUserList()
    })

    this.socket.on("receive-message", (message) => {
      this.handleIncomingMessage(message)
    })
  }

  showLoadingScreen() {
    if (this.loadingScreen) this.hideLoadingScreen()
    this.showLoginScreen()
  }

  hideLoadingScreen() {
    if (this.loadingScreen) {
      this.loadingScreen.style.opacity = "0"
      this.loadingScreen.style.visibility = "hidden"
    }
  }

  showLoginScreen() {
    this.loginScreen.classList.add("active")
  }

  handleLogin() {
    const username = this.usernameInput.value.trim()
    const password = this.passwordInput.value.trim()

    if (!username || !password) {
      this.showError("Username and password are required")
      return
    }

    this.showLoading()

    this.socket.emit("set-username", { name: username, password }, (result) => {
      this.hideLoading()

      if (result === "wrong") {
        this.showError("Incorrect password")
      } else if (result === true) {
        this.myUsername = username
        myUsername = username // Update global variable
        this.currentUserElement.textContent = username
        this.loginScreen.classList.remove("active")
        this.chatScreen.classList.add("active")
        this.currentChat = ""
        this.chatHeader.style.display = "none"
        this.chatInput.style.display = "none"
        this.sidebar.classList.add("active")
        const chatAreaContainer = $("chat-area-container")
        if (chatAreaContainer) chatAreaContainer.classList.remove("active")
        this.updateUserList()
        this.showToast(`Welcome back, ${username}!`, "success")
      } else {
        this.showError("Login failed. Please try again.")
      }
    })
  }

  showError(message) {
    this.loginError.textContent = message
    this.loginError.classList.add("show")

    setTimeout(() => {
      this.loginError.classList.remove("show")
    }, 5000)
  }

  switchToChat() {
    this.loginScreen.classList.remove("active")
    this.chatScreen.classList.add("active")

    // Clear login form
    this.usernameInput.value = ""
    this.passwordInput.value = ""
    this.loginError.classList.remove("show")
  }

  async updateUserList() {
    const search = this.searchInput.value.toLowerCase()
    let allUsers = []
    if (search.length > 0) {
      // Fetch from backend API
      try {
        const res = await fetch(`/api/users?search=${encodeURIComponent(search)}`)
        allUsers = await res.json()
      } catch (e) {
        allUsers = []
      }
    } else {
      // Only show users from recentChats (not all users)
      allUsers = this.recentChats.filter(u => u !== this.myUsername)
    }
    // Remove self from the list (already filtered above, but keep for safety)
    allUsers = allUsers.filter(u => u !== this.myUsername)
    this.userCountElement.textContent = allUsers.length
    this.userListElement.innerHTML = ""
    if (allUsers.length === 0) {
      const emptyState = document.createElement("div")
      emptyState.className = "empty-state"
      emptyState.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          <i class="fas fa-users" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
          <p>No operators found</p>
          <p style="font-size: 0.8rem; margin-top: 0.5rem;">Try searching for available operators</p>
        </div>
      `
      this.userListElement.appendChild(emptyState)
      return
    }
    allUsers.forEach((user) => {
      const userElement = document.createElement("div")
      userElement.className = `user ${user === this.currentChat ? "active" : ""}`
      const isOnline = this.users.includes(user)
      userElement.innerHTML = `
        <div class="user-item-avatar">
          ${user.charAt(0).toUpperCase()}
        </div>
        <div class="user-details">
          <div class="user-name">${user}</div>
          <div class="user-status">
            ${isOnline ? '<span style="color:#10b981;font-weight:600;"><i class="fas fa-circle" style="font-size:0.7em;"></i> Online</span>' : 'Offline'}
          </div>
        </div>
      `
      userElement.addEventListener("click", () => this.openChat(user))
      this.userListElement.appendChild(userElement)
    })
  }

  openChat(username) {
    this.currentChat = username
    currentChat = username // Update global variable
    this.chatUsername.textContent = username

    // Update UI
    this.chatHeader.style.display = "flex"
    this.chatInput.style.display = "block"

    // Mobile: show chat area, hide sidebar
    if (window.innerWidth <= 768) {
      const chatAreaContainer = $("chat-area-container")
      if (chatAreaContainer) chatAreaContainer.classList.add("active")
      this.sidebar.classList.remove("active")
      this.sidebar.style.display = "none"
    }

    // Load chat history
    this.loadChatHistory(username)
    this.updateUserList()
    this.messageInput.focus()
  }

  loadChatHistory(username) {
    this.chatArea.innerHTML = ""

    this.socket.emit("get-history", { withUser: username }, (history) => {
      if (history.length === 0) {
        this.showWelcomeMessage(username)
        return
      }

      history.forEach((msg) => {
        this.displayMessage(msg.message, msg.from, msg.time)
      })

      this.scrollToBottom()
    })
  }

  showWelcomeMessage(username) {
    const welcomeDiv = document.createElement("div")
    welcomeDiv.className = "welcome-screen"
    welcomeDiv.innerHTML = `
      <div class="welcome-icon">
        <i class="fas fa-satellite-dish"></i>
      </div>
      <h3>Secure Channel Established</h3>
      <p>Communication link with <strong>${username}</strong> is now active</p>
    `
    this.chatArea.appendChild(welcomeDiv)
  }

  handleIncomingMessage(message) {
    if (message.from === this.currentChat || message.to === this.currentChat) {
      this.displayMessage(message.message, message.from, message.time)
    }

    // Add to recent chats
    if (message.from !== this.myUsername && !this.recentChats.includes(message.from)) {
      this.recentChats.unshift(message.from)
      if (this.recentChats.length > 30) {
        this.recentChats = this.recentChats.slice(0, 30)
      }
      localStorage.setItem("recentChats", JSON.stringify(this.recentChats))
      recentChats = this.recentChats // Update global variable
      this.updateUserList()
    }

    // Show notification if not current chat
    if (message.from !== this.currentChat && message.from !== this.myUsername) {
      this.showToast(`New message from ${message.from}`, "info")
    }
  }

  displayMessage(message, from, time) {
    // Remove welcome message if exists
    const welcomeScreen = this.chatArea.querySelector(".welcome-screen")
    if (welcomeScreen) {
      welcomeScreen.remove()
    }

    const messageDiv = document.createElement("div")
    const isSent = from === this.myUsername

    messageDiv.className = `message ${isSent ? "sent" : "received"}`

    const timeStr = new Date(time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })

    messageDiv.innerHTML = `
      <div class="message-content">
        ${!isSent ? `<div class="sender">${from}</div>` : ""}
        <div class="bubble">${this.escapeHtml(message)}</div>
        <div class="timestamp">${timeStr}</div>
      </div>
    `

    this.chatArea.appendChild(messageDiv)
    this.scrollToBottom()
  }

  sendMessage() {
    const message = this.messageInput.value.trim()

    if (!message || !this.currentChat) return

    if (message.length > 500) {
      this.showToast("Message too long (max 500 characters)", "warning")
      return
    }

    this.socket.emit("send-message", {
      to: this.currentChat,
      message: message,
    })

    // Add to recent chats only after sending a message
    if (!this.recentChats.includes(this.currentChat)) {
      this.recentChats.unshift(this.currentChat)
      if (this.recentChats.length > 30) {
        this.recentChats = this.recentChats.slice(0, 30)
      }
      localStorage.setItem("recentChats", JSON.stringify(this.recentChats))
      recentChats = this.recentChats // Update global variable
    }

    this.messageInput.value = ""
    this.updateCharCount()
    this.messageInput.focus()
  }

  updateCharCount() {
    const count = this.messageInput.value.length
    this.charCount.textContent = count

    if (count > 450) {
      this.charCount.style.color = "var(--error-red)"
    } else if (count > 400) {
      this.charCount.style.color = "var(--warning-yellow)"
    } else {
      this.charCount.style.color = "var(--text-muted)"
    }
  }

  handleTyping() {
    if (!this.isTyping) {
      this.isTyping = true
      // Could emit typing indicator here
      setTimeout(() => {
        this.isTyping = false
      }, 1000)
    }
  }

  toggleEmojiPicker() {
    const picker = this.emojiPicker

    if (picker.style.display === "block") {
      picker.style.display = "none"
      return
    }

    // Always repopulate emoji picker to ensure emojis are present
    this.populateEmojiPicker()
    picker.style.display = "block"
  }

  populateEmojiPicker() {
    const emojis = [
      "😀",
      "😁",
      "😂",
      "🤣",
      "😃",
      "😄",
      "😅",
      "😆",
      "😉",
      "😊",
      "😋",
      "😎",
      "😍",
      "😘",
      "🥰",
      "😗",
      "😙",
      "😚",
      "🙂",
      "🤗",
      "🤩",
      "🤔",
      "🤨",
      "😐",
      "😑",
      "😶",
      "🙄",
      "😏",
      "😣",
      "😥",
      "😮",
      "🤐",
      "😯",
      "😪",
      "😫",
      "🥱",
      "😴",
      "😌",
      "😛",
      "😜",
      "😝",
      "🤤",
      "😒",
      "😓",
      "😔",
      "😕",
      "🙃",
      "🤑",
      "😲",
      "☹️",
      "🙁",
      "😖",
      "😞",
      "😟",
      "😤",
      "😢",
      "😭",
      "😦",
      "😧",
      "😨",
      "😩",
      "🤯",
      "😬",
      "😰",
      "😱",
      "🥵",
      "🥶",
      "😳",
      "🤪",
      "😵",
      "😡",
      "😠",
      "🤬",
      "😷",
      "🤒",
      "🤕",
      "🤢",
      "🤮",
      "🥴",
      "😇",
      "🥳",
      "🥺",
      "🤠",
      "🤡",
      "🤥",
      "🤫",
      "🤭",
      "🧐",
      "🤓",
      "😈",
      "👿",
      "👹",
      "👺",
      "💀",
      "👻",
      "👽",
      "🤖",
      "💩",
      "😺",
      "😸",
      "😹",
      "😻",
      "😼",
      "😽",
      "🙀",
      "😿",
      "😾",
      "🚀",
      "⚡",
      "🔥",
      "💎",
      "🎯",
      "🎮",
      "🎵",
      "🎸",
      "🏆",
      "💪",
      "👍",
      "👎",
      "✌️",
      "🤞",
      "🤟",
      "🤘",
      "👌",
      "👈",
      "👉",
      "👆",
      "👇",
      "☝️",
      "✋",
      "🤚",
      "🖐️",
      "🖖",
      "👋",
      "🤙",
      "💪",
      "🖕",
      "✍️",
      "🙏",
      "💋",
      "💘",
      "💝",
      "💖",
      "💗",
      "💓",
      "💞",
      "💕",
      "💟",
      "❣️",
      "💔",
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🤎",
      "🖤",
      "🤍",
      "💯",
      "💢",
      "💥",
      "💫",
      "💦",
      "💨",
    ]

    this.emojiPicker.innerHTML = ""

    emojis.forEach((emoji) => {
      const emojiSpan = document.createElement("span")
      emojiSpan.className = "emoji"
      emojiSpan.textContent = emoji
      emojiSpan.addEventListener("click", () => {
        this.messageInput.value += emoji
        this.messageInput.focus()
        this.emojiPicker.style.display = "none"
        this.updateCharCount()
      })
      this.emojiPicker.appendChild(emojiSpan)
    })
  }

  closeChat() {
    this.currentChat = ""
    currentChat = "" // Update global variable
    this.chatHeader.style.display = "none"
    this.chatInput.style.display = "none"
    this.chatArea.innerHTML = `
      <div class="welcome-screen">
        <div class="welcome-icon">
          <i class="fas fa-satellite-dish"></i>
        </div>
        <h3>Communication Hub Ready</h3>
        <p>Select an operator from the sidebar to establish secure communication</p>
      </div>
    `

    // Mobile: show sidebar
    if (window.innerWidth <= 768) {
      const chatAreaContainer = $("chat-area-container")
      if (chatAreaContainer) chatAreaContainer.classList.remove("active")
      this.sidebar.style.display = "flex"
    }

    this.updateUserList()
  }

  logout() {
    this.socket.emit("logout")
    this.myUsername = ""
    myUsername = "" // Update global variable
    this.currentChat = ""
    currentChat = "" // Update global variable
    this.users = []
    users = [] // Update global variable

    // Reset UI
    this.closeChat()
    this.chatScreen.classList.remove("active")
    this.loginScreen.classList.add("active")

    this.showToast("Disconnected from system", "success")
  }

  showLoading() {
    // Could add loading state to login button
  }

  hideLoading() {
    // Could remove loading state from login button
  }

  showToast(message, type = "info") {
    const toast = document.createElement("div")
    toast.className = `toast ${type}`

    const icons = {
      success: "check-circle",
      error: "exclamation-circle",
      warning: "exclamation-triangle",
      info: "info-circle",
    }

    toast.innerHTML = `
      <div class="toast-content">
        <i class="fas fa-${icons[type]} toast-icon"></i>
        <span class="toast-message">${message}</span>
      </div>
    `

    this.toastContainer.appendChild(toast)

    setTimeout(() => {
      toast.style.animation = "toastSlide 0.4s ease reverse"
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast)
        }
      }, 400)
    }, 3000)
  }

  scrollToBottom() {
    this.chatArea.scrollTop = this.chatArea.scrollHeight
  }

  escapeHtml(text) {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }
}

// Global functions for HTML onclick handlers
function setUsername() {
  window.dakChat.handleLogin()
}

function logout() {
  window.dakChat.logout()
}

function sendMessage() {
  window.dakChat.sendMessage()
}

function toggleEmojiPicker() {
  window.dakChat.toggleEmojiPicker()
}

function closeChat() {
  window.dakChat.closeChat()
}

function renderUserList() {
  window.dakChat.updateUserList()
}

// Initialize the app
window.addEventListener("load", () => {
  window.dakChat = new DakChat()
})

// Handle online/offline events
window.addEventListener("online", () => {
  window.dakChat?.showToast("Connection restored", "success")
})

window.addEventListener("offline", () => {
  window.dakChat?.showToast("Connection lost", "error")
})
