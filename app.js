/* -------------------------------------------------- */
/* FIREBASE CONFIG */
/* -------------------------------------------------- */

const firebaseConfig = {
  apiKey: "AIzaSyCYOSnIo8mJd8Zxo-C7MbHrUBMckBdnWB4",
  authDomain: "the-midnight-desk.firebaseapp.com",
  projectId: "the-midnight-desk",
  storageBucket: "the-midnight-desk.appspot.com",
  messagingSenderId: "650730053235",
  appId: "1:650730053235:web:44cc74159f1b973a3d1406"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

/* -------------------------------------------------- */
/* AUTH STATE LISTENER — FINAL CLEAN VERSION */
/* -------------------------------------------------- */

auth.onAuthStateChanged(user => {

    const logoutBtn = document.getElementById("logout-btn");
    const adminLink = document.getElementById("admin-link");

    /* SHOW LOGOUT BUTTON */
    if (logoutBtn) logoutBtn.style.display = user ? "inline-block" : "none";

    /* SHOW ADMIN BUTTON ONLY FOR YOU */
    if (adminLink) {
        if (user && user.email.toLowerCase() === "parisakpuoye@gmail.com") {
            adminLink.style.display = "inline-block";
        } else {
            adminLink.style.display = "none";
        }
    }

    /* ADMIN PAGE PROTECTION */
    const path = window.location.pathname.toLowerCase();

    const isAdminPage =
        path.includes("admin-") &&
        !path.includes("admin.html");

    if (isAdminPage) {

        if (!user) {
            return window.location.href = "admin.html";
        }

        if (user.email.toLowerCase() !== "parisakpuoye@gmail.com") {
            return window.location.href = "index.html";
        }
    }

    /* PROTECT SUBMISSION PAGE */
    if (path.includes("submission.html")) {
        if (!user) {
            return window.location.href = "login.html";
        } else {
            if (typeof loadFeed === "function") loadFeed();
        }
    }

    /* FUTURE FEATURE HOOKS */
    if (typeof initReadingProgress === "function") initReadingProgress(user);
    if (typeof initNotifications === "function") initNotifications(user);
    if (typeof initDynamicHomepage === "function") initDynamicHomepage(user);
});

/* -------------------------------------------------- */
/* LOGIN + SIGNUP */
/* -------------------------------------------------- */

if (document.getElementById("login-btn")) {

    document.getElementById("login-btn").onclick = async () => {
        const email = document.getElementById("login-email").value.trim();
        const pass = document.getElementById("login-password").value.trim();

        try {
            await auth.signInWithEmailAndPassword(email, pass);
            window.location.href = "submission.html";
        } catch (err) {
            document.getElementById("login-error").innerText = err.message;
        }
    };

    document.getElementById("signup-btn").onclick = async () => {
        const email = document.getElementById("login-email").value.trim();
        const pass = document.getElementById("login-password").value.trim();

        try {
            await auth.createUserWithEmailAndPassword(email, pass);
            window.location.href = "submission.html";
        } catch (err) {
            document.getElementById("login-error").innerText = err.message;
        }
    };
}

/* -------------------------------------------------- */
/* LOGOUT */
/* -------------------------------------------------- */

if (document.getElementById("logout-btn")) {
    document.getElementById("logout-btn").onclick = () => auth.signOut();
}

/* -------------------------------------------------- */
/* CREATE NEW POST */
/* -------------------------------------------------- */

if (document.getElementById("new-post-form")) {
    document.getElementById("new-post-form").addEventListener("submit", async (e) => {
        e.preventDefault();

        const user = auth.currentUser;
        if (!user) return;

        const text = document.getElementById("post-text").value;
        const fileInput = document.getElementById("post-image-file");
        const file = fileInput ? fileInput.files[0] : null;

        const postRef = await db.collection("posts").add({
            text,
            userId: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            imageUrl: null,
            replyCount: 0
        });

        if (file) {
            const storageRef = storage.ref(`posts/${postRef.id}/image.jpg`);
            await storageRef.put(file);
            const url = await storageRef.getDownloadURL();
            await postRef.update({ imageUrl: url });
        }

        document.getElementById("new-post-form").reset();
    });
}

/* -------------------------------------------------- */
/* LOAD FEED */
/* -------------------------------------------------- */

function loadFeed() {
    const feed = document.getElementById("feed");
    if (!feed) return;

    db.collection("posts")
        .orderBy("createdAt", "desc")
        .onSnapshot(snapshot => {
            feed.innerHTML = "";
            snapshot.forEach(doc => renderPost(doc));
        });
}

/* -------------------------------------------------- */
/* RENDER POST */
/* -------------------------------------------------- */

function renderPost(doc) {
    const data = doc.data();
    const id = doc.id;
    const user = auth.currentUser;

    const post = document.createElement("div");
    post.className = "post";

    post.innerHTML = `
        <p>${data.text}</p>
        ${data.imageUrl ? `<img src="${data.imageUrl}" class="post-image">` : ""}
        <div style="margin-top:10px;">
            <button onclick="toggleReplies('${id}')">💬 View replies (${data.replyCount || 0})</button>
            <button onclick="showReplyBox('${id}')">Reply</button>
            ${user && user.uid === data.userId ? `<button onclick="deletePost('${id}')">Delete</button>` : ""}
        </div>
        <div id="reply-box-${id}" style="display:none; margin-top:10px;">
            <textarea id="reply-text-${id}" placeholder="Write a reply..."></textarea>
            <button onclick="submitReply('${id}')">Send</button>
        </div>
        <div id="replies-${id}" style="display:none; margin-top:15px;"></div>
    `;

    document.getElementById("feed").appendChild(post);
}

/* -------------------------------------------------- */
/* REPLY SYSTEM */
/* -------------------------------------------------- */

function showReplyBox(postId) {
    const box = document.getElementById(`reply-box-${postId}`);
    box.style.display = box.style.display === "none" ? "block" : "none";
}

async function submitReply(postId) {
    const user = auth.currentUser;
    if (!user) return;

    const text = document.getElementById(`reply-text-${postId}`).value;

    await db.collection("posts").doc(postId).collection("replies").add({
        text,
        userId: user.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection("posts").doc(postId).update({
        replyCount: firebase.firestore.FieldValue.increment(1)
    });

    document.getElementById(`reply-text-${postId}`).value = "";
}

function toggleReplies(postId) {
    const container = document.getElementById(`replies-${postId}`);
    const isOpen = container.style.display === "block";

    container.style.display = isOpen ? "none" : "block";

    if (!isOpen) loadReplies(postId);
}

function loadReplies(postId) {
    const container = document.getElementById(`replies-${postId}`);
    container.innerHTML = "";

    db.collection("posts").doc(postId).collection("replies")
        .orderBy("createdAt", "asc")
        .onSnapshot(snapshot => {
            container.innerHTML = "";
            snapshot.forEach(doc => renderReply(doc, postId));
        });
}

function renderReply(doc, postId) {
    const data = doc.data();
    const id = doc.id;
    const user = auth.currentUser;

    const div = document.createElement("div");
    div.className = "reply";

    div.innerHTML = `
        <p>${data.text}</p>
        ${user && user.uid === data.userId ? `<button onclick="deleteReply('${postId}', '${id}')">Delete</button>` : ""}
    `;

    document.getElementById(`replies-${postId}`).appendChild(div);
}

/* -------------------------------------------------- */
/* DELETE POST */
/* -------------------------------------------------- */

async function deletePost(postId) {
    const user = auth.currentUser;
    if (!user) return;

    const postRef = db.collection("posts").doc(postId);
    const post = await postRef.get();

    if (post.data().userId !== user.uid) return;

    await postRef.delete();
    await storage.ref(`posts/${postId}/image.jpg`).delete().catch(() => {});
}

/* -------------------------------------------------- */
/* DELETE REPLY */
/* -------------------------------------------------- */

async function deleteReply(postId, replyId) {
    const user = auth.currentUser;
    if (!user) return;

    const replyRef = db.collection("posts").doc(postId).collection("replies").doc(replyId);
    const reply = await replyRef.get();

    if (reply.data().userId !== user.uid) return;

    await replyRef.delete();

    await db.collection("posts").doc(postId).update({
        replyCount: firebase.firestore.FieldValue.increment(-1)
    });
}