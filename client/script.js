import { io } from "socket.io-client"

class DakChat {
  constructor() {
    this.socket = io()
    this.currentUser = ""
    this.selectedUser = ""
    this.users = []

    this.initializeElements()
    this.bindEvents()
    this.setupSocketListeners()
  }

  initializeElements() { this.loginScreen = document.getElementById("loginScreen"), this.chatScreen = document.getElementById("chatScreen"), this.loadingOverlay = document.getElementById("loadingOverlay"), this.loginForm = document.getElementById("loginForm"), this.usernameInput = document.getElementById("username"), this.passwordInput = document.getElementById("password"), this.currentUserElement = document.getElementById("currentUser"), this.userCountElement = document.getElementById("userCount"), this.userListElement = document.getElementById("userList"), this.chatTitle = document.getElementById("chatTitle"), this.chatStatus = document.getElementById("chatStatus"), this.messagesContainer = document.getElementById("messagesContainer"), this.messageInput = document.getElementById("messageInput"), this.messageText = document.getElementById("messageText"), this.sendBtn = document.getElementById("sendBtn"), this.logoutBtn = document.getElementById("logoutBtn"), this.charCount = document.getElementById("charCount"), this.toastContainer = document.getElementById("toastContainer") }

  bindEvents() { this.loginForm.addEventListener("submit", (e) => this.handleLogin(e)), this.sendBtn.addEventListener("click", () => this.sendMessage()), this.messageText.addEventListener("keypress", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(), this.sendMessage() } }), this.messageText.addEventListener("input", () => this.updateCharCount()), this.logoutBtn.addEventListener("click", () => this.logout()), this.messageText.addEventListener("input", () => this.autoResizeInput()) }

  setupSocketListeners() { this.socket.on("user-list", (users) => this.updateUserList(users)), this.socket.on("receive-message", (message) => this.displayMessage(message)), this.socket.on("connect", () => { this.hideLoading(), this.showToast("Connected to server", "success") }), this.socket.on("disconnect", () => { this.showToast("Disconnected from server", "error") }) }

  async handleLogin(e) {
    e.preventDefault()

    const username = this.usernameInput.value.trim()
    const password = this.passwordInput.value.trim()

    if (!username || !password) {
      this.showToast("Please fill in all fields", "warning")
      return
    }

    this.showLoading("Signing in...")

    this.socket.emit("set-username", { name: username, password }, (response) => {
      this.hideLoading()

      if (response === true) {
        this.currentUser = username
        this.currentUserElement.textContent = username
        this.switchToChat()
        this.showToast(`Welcome, ${username}!`, "success")
      } else if (response === "wrong") {
        this.showToast("Incorrect password", "error")
      } else {
        this.showToast("Login failed. Please try again.", "error")
      }
    })
  }

  switchToChat() { this.loginScreen.classList.remove("active"), this.chatScreen.classList.add("active"), this.usernameInput.value = "", this.passwordInput.value = "" }

  updateUserList(users) {
    this.users = users.filter((user) => user !== this.currentUser)
    this.userCountElement.textContent = this.users.length

    this.userListElement.innerHTML = ""

    if (this.users.length === 0) {
      const emptyState = document.createElement("div")
      emptyState.className = "empty-state"
      emptyState.innerHTML = `
                <p style="color: #94a3b8; font-size: 14px; text-align: center; padding: 20px;">
                    No other users online
                </p>
            `
      this.userListElement.appendChild(emptyState)
      return
    }

    this.users.forEach((user) => {
      const userElement = document.createElement("div")
      userElement.className = "user-item"
      userElement.innerHTML = `
                <div class="user-item-avatar">
                    ${user.charAt(0).toUpperCase()}
                </div>
                <div class="user-name">${user}</div>
            `

      userElement.addEventListener("click", () => this.selectUser(user, userElement))
      this.userListElement.appendChild(userElement)
    })
  }

  selectUser(username, element) {
    // Remove active class from all users
    document.querySelectorAll(".user-item").forEach((item) => {
      item.classList.remove("active")
    })

    // Add active class to selected user
    element.classList.add("active")

    this.selectedUser = username
    this.chatTitle.textContent = `Chat with ${username}`
    this.chatStatus.textContent = "Online"

    // Show message input
    this.messageInput.style.display = "block"

    // Load chat history
    this.loadChatHistory(username)

    // Focus on message input
    this.messageText.focus()
  }

  loadChatHistory(username) {
    this.socket.emit("get-history", { withUser: username }, (history) => {
      this.messagesContainer.innerHTML = ""

      if (history.length === 0) {
        const emptyState = document.createElement("div")
        emptyState.className = "welcome-message"
        emptyState.innerHTML = `
                    <div class="welcome-icon">
                        <i class="fas fa-comment-dots"></i>
                    </div>
                    <h3>Start a conversation</h3>
                    <p>Send a message to ${username} to begin chatting.</p>
                `
        this.messagesContainer.appendChild(emptyState)
        return
      }

      history.forEach((message) => {
        this.displayMessage(message, false)
      })

      this.scrollToBottom()
    })
  }

  displayMessage(message, animate = true) {
    // Only show messages for current chat
    if (
      this.selectedUser &&
      message.from !== this.selectedUser &&
      message.to !== this.selectedUser &&
      message.from !== this.currentUser &&
      message.to !== this.currentUser
    ) {
      return
    }

    // Clear welcome message if it exists
    const welcomeMessage = this.messagesContainer.querySelector(".welcome-message")
    if (welcomeMessage) {
      welcomeMessage.remove()
    }

    const messageElement = document.createElement("div")
    const isSent = message.from === this.currentUser

    messageElement.className = `message ${isSent ? "sent" : "received"}`
    if (animate) messageElement.classList.add("fade-in")

    const time = new Date(message.time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })

    messageElement.innerHTML = `
            <div class="message-content">
                ${!isSent ? `<div class="message-sender">${message.from}</div>` : ""}
                <div class="message-text">${this.escapeHtml(message.message)}</div>
                <div class="message-time">${time}</div>
            </div>
        `

    this.messagesContainer.appendChild(messageElement)
    this.scrollToBottom()

    // Show notification if message is from someone else and not current chat
    if (!isSent && message.from !== this.selectedUser) {
      this.showToast(`New message from ${message.from}`, "info")
    }
  }

  sendMessage() {
    const message = this.messageText.value.trim()

    if (!message || !this.selectedUser) return

    if (message.length > 500) {
      this.showToast("Message too long (max 500 characters)", "warning")
      return
    }

    this.socket.emit("send-message", {
      to: this.selectedUser,
      message: message,
    })

    this.messageText.value = ""
    this.updateCharCount()
    this.messageText.focus()
  }

  updateCharCount() {
    const count = this.messageText.value.length
    this.charCount.textContent = count

    if (count > 450) {
      this.charCount.style.color = "#ef4444"
    } else if (count > 400) {
      this.charCount.style.color = "#f59e0b"
    } else {
      this.charCount.style.color = "#94a3b8"
    }
  }

  logout() {
    this.socket.emit("logout")
    this.currentUser = ""
    this.selectedUser = ""
    this.users = []

    // Reset UI
    this.messagesContainer.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-comments"></i>
                </div>
                <h3>Welcome to DakChat!</h3>
                <p>Select a user from the sidebar to start a conversation.</p>
            </div>
        `

    this.messageInput.style.display = "none"
    this.chatTitle.textContent = "Select a user to start chatting"
    this.chatStatus.textContent = ""

    // Switch to login screen
    this.chatScreen.classList.remove("active")
    this.loginScreen.classList.add("active")

    this.showToast("Logged out successfully", "success")
  }

  showLoading(message = "Loading...") {
    this.loadingOverlay.querySelector("p").textContent = message
    this.loadingOverlay.classList.add("active")
  }

  hideLoading() {
    this.loadingOverlay.classList.remove("active")
  }

  showToast(message, type = "info") {
    const toast = document.createElement("div")
    toast.className = `toast ${type}`
    toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-${this.getToastIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `

    this.toastContainer.appendChild(toast)

    // Auto remove after 3 seconds
    setTimeout(() => {
      toast.style.animation = "toastSlide 0.3s ease reverse"
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast)
        }
      }, 300)
    }, 3000)
  }

  getToastIcon(type) {
    const icons = {
      success: "check-circle",
      error: "exclamation-circle",
      warning: "exclamation-triangle",
      info: "info-circle",
    }
    return icons[type] || "info-circle"
  }

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight
  }

  escapeHtml(text) {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }

  autoResizeInput() {
    // This could be expanded for textarea auto-resize if needed
    // For now, we're using a single-line input
  }
}

// Initialize the app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new DakChat()
})

// Add some utility functions for enhanced UX
document.addEventListener("keydown", (e) => {
  // ESC key to close modals or deselect
  if (e.key === "Escape") {
    // Could be used for closing modals in future
  }
})

// Add online/offline detection
window.addEventListener("online", () => {
  document.querySelector(".dakchat")?.showToast?.("Connection restored", "success")
})

window.addEventListener("offline", () => {
  document.querySelector(".dakchat")?.showToast?.("Connection lost", "error")
})
