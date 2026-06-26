/* -------------------------------------------------- */
/* FIREBASE CONFIG                                    */
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
/* CHAPTER RELEASE CHECK                              */
/* -------------------------------------------------- */

function isChapterReleased(chapterData) {
    if (!chapterData.releaseAt) return true;
    return chapterData.releaseAt.toDate() <= new Date();
}

/* -------------------------------------------------- */
/* AUTH STATE LISTENER                                */
/* -------------------------------------------------- */

auth.onAuthStateChanged(user => {
    const logoutBtn = document.getElementById("logout-btn");
    const adminLink = document.getElementById("admin-link");

    if (logoutBtn) logoutBtn.style.display = user ? "inline-block" : "none";

    if (adminLink) {
        adminLink.style.display =
            user && user.email.toLowerCase() === "parisakpuoye@gmail.com"
                ? "inline-block"
                : "none";
    }

    const path = window.location.pathname.toLowerCase();
    const isAdminPage = path.includes("admin-") && !path.includes("admin.html");

    if (isAdminPage) {
        if (!user) return (window.location.href = "admin.html");
        if (user.email.toLowerCase() !== "parisakpuoye@gmail.com")
            return (window.location.href = "index.html");
    }

    if (path.includes("submission.html")) {
        if (!user) return (window.location.href = "login.html");
        if (typeof loadFeed === "function") loadFeed();
    }

    if (typeof initReadingProgress === "function") initReadingProgress(user);
    if (typeof initNotifications === "function") initNotifications(user);
    if (typeof initDynamicHomepage === "function") initDynamicHomepage(user);
});

/* -------------------------------------------------- */
/* LOGIN + SIGNUP                                     */
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
/* LOGOUT                                             */
/* -------------------------------------------------- */

if (document.getElementById("logout-btn")) {
    document.getElementById("logout-btn").onclick = () => auth.signOut();
}

/* -------------------------------------------------- */
/* CREATE POST                                        */
/* -------------------------------------------------- */

if (document.getElementById("new-post-form")) {
    document.getElementById("new-post-form").addEventListener("submit", async (e) => {
        e.preventDefault();

        const user = auth.currentUser;
        if (!user) return;

        const text = document.getElementById("post-text").value.trim();
        const file = document.getElementById("post-image-file")?.files[0] || null;

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
/* LOAD FEED                                          */
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
/* RENDER POST                                        */
/* -------------------------------------------------- */

function renderPost(doc) {
    const data = doc.data();
    const id = doc.id;
    const user = auth.currentUser;

    const post = document.createElement("div");
    post.className = "post-card";

    post.innerHTML = `
        <p>${escapeHTML(data.text)}</p>
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
/* REPLY SYSTEM                                       */
/* -------------------------------------------------- */

function showReplyBox(postId) {
    const box = document.getElementById(`reply-box-${postId}`);
    if (box) box.style.display = box.style.display === "none" ? "block" : "none";
}

async function submitReply(postId) {
    const user = auth.currentUser;
    if (!user) return;

    const textarea = document.getElementById(`reply-text-${postId}`);
    const text = textarea.value.trim();
    if (!text) return;

    const postRef = db.collection("posts").doc(postId);
    const postSnap = await postRef.get();
    const postOwnerId = postSnap.exists ? postSnap.data().userId : null;

    const replyRef = await postRef.collection("replies").add({
        text,
        userId: user.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await postRef.update({
        replyCount: firebase.firestore.FieldValue.increment(1)
    });

    if (postOwnerId && postOwnerId !== user.uid) {
        await db.collection("notifications").add({
            userId: postOwnerId,
            type: "reply",
            postId,
            replyId: replyRef.id,
            text,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            read: false
        });
    }

    textarea.value = "";
}

function toggleReplies(postId) {
    const container = document.getElementById(`replies-${postId}`);
    if (!container) return;

    const isOpen = container.style.display === "block";
    container.style.display = isOpen ? "none" : "block";

    if (!isOpen) loadReplies(postId);
}

function loadReplies(postId) {
    const container = document.getElementById(`replies-${postId}`);
    if (!container) return;

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
    div.className = "reply-card";

    div.innerHTML = `
        <p>${escapeHTML(data.text)}</p>
        ${user && user.uid === data.userId ? `<button onclick="deleteReply('${postId}', '${id}')">Delete</button>` : ""}
    `;

    document.getElementById(`replies-${postId}`).appendChild(div);
}

/* -------------------------------------------------- */
/* DELETE POST + CLEANUP                              */
/* -------------------------------------------------- */

async function deletePost(postId) {
    const user = auth.currentUser;
    if (!user) return;

    const postRef = db.collection("posts").doc(postId);
    const post = await postRef.get();

    if (!post.exists || post.data().userId !== user.uid) return;

    const repliesSnap = await postRef.collection("replies").get();
    const batch = db.batch();

    repliesSnap.forEach(r => batch.delete(r.ref));

    const notifSnap = await db.collection("notifications")
        .where("postId", "==", postId)
        .get();

    notifSnap.forEach(n => batch.delete(n.ref));

    batch.delete(postRef);
    await batch.commit();

    await storage.ref(`posts/${postId}/image.jpg`).delete().catch(() => {});
}

/* -------------------------------------------------- */
/* DELETE REPLY                                       */
/* -------------------------------------------------- */

async function deleteReply(postId, replyId) {
    const user = auth.currentUser;
    if (!user) return;

    const replyRef = db.collection("posts").doc(postId).collection("replies").doc(replyId);
    const reply = await replyRef.get();

    if (!reply.exists || reply.data().userId !== user.uid) return;

    await replyRef.delete();

    await db.collection("posts").doc(postId).update({
        replyCount: firebase.firestore.FieldValue.increment(-1)
    });
}

/* -------------------------------------------------- */
/* DYNAMIC HOMEPAGE                                   */
/* -------------------------------------------------- */

async function initDynamicHomepage(user) {
    const featuredEl = document.getElementById("featured-story-content");
    const latestEl = document.getElementById("latest-chapter-content");
    const loreEl = document.getElementById("lore-spotlight-content");
    const charEl = document.getElementById("character-of-week-content");
    const commEl = document.getElementById("community-highlights-content");

    if (!featuredEl && !latestEl && !loreEl && !charEl && !commEl) return;

    /* FEATURED STORY */
    try {
        const snap = await db.collection("stories")
            .where("category", "==", "main")
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();

        if (!snap.empty) {
            const doc = snap.docs[0];
            const story = doc.data();

            featuredEl.innerHTML = `
                <h3>${escapeHTML(story.title)}</h3>
                <p>${escapeHTML(story.description || "")}</p>
                <a href="story-hub.html?id=${doc.id}" class="story-btn">Read Story</a>
            `;
        } else {
            featuredEl.innerHTML = "<p>No stories available.</p>";
        }
    } catch {
        featuredEl.innerHTML = "<p style='color:pink;'>Error loading featured story.</p>";
    }

    /* LATEST CHAPTER */
    try {
        const snap = await db.collectionGroup("chapters")
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();

        if (!snap.empty) {
            const doc = snap.docs[0];
            const chapter = doc.data();
            const storyId = doc.ref.parent.parent.id;

            latestEl.innerHTML = `
                <h3>${escapeHTML(chapter.title)}</h3>
                <a href="chapter.html?story=${storyId}&chapter=${doc.id}" class="story-btn">
                    Continue Reading
                </a>
            `;
        } else {
            latestEl.innerHTML = "<p>No chapters yet.</p>";
        }
    } catch {
        latestEl.innerHTML = "<p style='color:pink;'>Error loading latest chapter.</p>";
    }

    /* LORE SPOTLIGHT */
    try {
        const snap = await db.collection("lore")
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();

        if (!snap.empty) {
            const doc = snap.docs[0];
            const lore = doc.data();

            loreEl.innerHTML = `
                <h3>${escapeHTML(lore.title)}</h3>
                <p>${escapeHTML(lore.summary || "")}</p>
                <a href="world-lore.html" class="story-btn">Explore Lore</a>
            `;
        } else {
            loreEl.innerHTML = "<p>No lore entries yet.</p>";
        }
    } catch {
        loreEl.innerHTML = "<p style='color:pink;'>Error loading lore spotlight.</p>";
    }

    /* CHARACTER OF THE WEEK */
    try {
        const snap = await db.collection("characters")
            .orderBy("featuredAt", "desc")
            .limit(1)
            .get();

        if (!snap.empty) {
            const doc = snap.docs[0];
            const ch = doc.data();

            charEl.innerHTML = `
                <h3>${escapeHTML(ch.name)}</h3>
                <p>${escapeHTML(ch.description || "")}</p>
            `;
        } else {
            charEl.innerHTML = "<p>No characters available.</p>";
        }
    } catch {
        charEl.innerHTML = "<p style='color:pink;'>Error loading character.</p>";
    }

    /* COMMUNITY HIGHLIGHTS */
    try {
        const snap = await db.collection("posts")
            .orderBy("createdAt", "desc")
            .limit(3)
            .get();

        if (!snap.empty) {
            let html = "";
            snap.forEach(doc => {
                const p = doc.data();
                html += `
                    <div class="mini-post">
                        <p>${escapeHTML(p.text)}</p>
                        ${p.imageUrl ? `<img src="${p.imageUrl}" class="post-image">` : ""}
                    </div>
                `;
            });
            commEl.innerHTML = html;
        } else {
            commEl.innerHTML = "<p>No community posts yet.</p>";
        }
    } catch {
        commEl.innerHTML = "<p style='color:pink;'>Error loading community posts.</p>";
    }
}

/* -------------------------------------------------- */
/* READING PROGRESS HOOK                              */
/* -------------------------------------------------- */

function initReadingProgress(user) {
    window.readingUser = user || null;
}

/* -------------------------------------------------- */
/* NOTIFICATIONS + TOASTS                             */
/* -------------------------------------------------- */

function createToastContainer() {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    return container;
}

function showToast(message) {
    const container = createToastContainer();
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 10);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function initNotifications(user) {
    const badge = document.getElementById("notif-count");

    if (!user) {
        if (badge) badge.textContent = "";
        return;
    }

    db.collection("notifications")
        .where("userId", "==", user.uid)
        .where("read", "==", false)
        .orderBy("createdAt", "desc")
        .onSnapshot(snapshot => {
            const unread = snapshot.size;
            if (badge) badge.textContent = unread > 0 ? unread : "";

            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    showToast(data.type === "reply" ? "New reply to your post" : "New notification");
                }
            });
        });
}

/* -------------------------------------------------- */
/* CHAPTER REACTIONS                                  */
/* -------------------------------------------------- */

async function loadChapterReactions() {
    const user = auth.currentUser;
    if (!user) return;

    const params = new URLSearchParams(window.location.search);
    const storyId = params.get("story");
    const chapterId = params.get("chapter");

    if (!storyId || !chapterId) return;

    const reactionsRef = db
        .collection("stories")
        .doc(storyId)
        .collection("chapters")
        .doc(chapterId)
        .collection("reactions");

    const userDoc = await reactionsRef.doc(user.uid).get();
    if (userDoc.exists) highlightUserReactions(userDoc.data());

    const types = ["awe", "love", "emotional", "intense", "suspense"];
    for (let t of types) {
        const snap = await reactionsRef.where(t, "==", true).get();
        const el = document.getElementById(`count-${t}`);
        if (el) el.textContent = snap.size;
    }
}

function highlightUserReactions(data) {
    Object.keys(data).forEach(key => {
        if (data[key] === true) {
            const btn = document.querySelector(`.reaction-btn[data-type="${key}"]`);
            if (btn) btn.classList.add("active-reaction");
        }
    });
}

async function toggleChapterReaction(type) {
    const user = auth.currentUser;
    if (!user) return;

    const params = new URLSearchParams(window.location.search);
    const storyId = params.get("story");
    const chapterId = params.get("chapter");

    if (!storyId || !chapterId) return;

    const ref = db
        .collection("stories")
        .doc(storyId)
        .collection("chapters")
        .doc(chapterId)
        .collection("reactions")
        .doc(user.uid);

    const docSnap = await ref.get();
    const current = docSnap.exists ? docSnap.data()[type] : false;

    await ref.set(
        {
            [type]: !current,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
    );

    loadChapterReactions();
}

/* -------------------------------------------------- */
/* MINI MUSIC PLAYER ENGINE                           */
/* -------------------------------------------------- */

let playlist = [];
let currentTrack = 0;
let isLooping = false;
let scMode = false;

async function initChapterMusicPlayer() {
    const params = new URLSearchParams(window.location.search);
    const storyId = params.get("story");
    const chapterId = params.get("chapter");

    if (!storyId || !chapterId) return;

    const chapterRef = db
        .collection("stories")
        .doc(storyId)
        .collection("chapters")
        .doc(chapterId);

    const chapterDoc = await chapterRef.get();
    const settings = chapterDoc.data()?.musicSettings || {};

    const snap = await chapterRef.collection("playlist").get();
    playlist = snap.docs.map(doc => doc.data());

    if (playlist.length === 0) return;

    const volSlider = document.getElementById("mp-volume-slider");
    if (volSlider) {
        volSlider.value = settings.volume ?? 0.8;
        volSlider.addEventListener("input", e => {
            const audio = document.getElementById("mp-audio");
            if (audio) audio.volume = e.target.value;
        });
    }

    document.getElementById("mp-play")?.addEventListener("click", togglePlay);
    document.getElementById("mp-next")?.addEventListener("click", nextTrack);
    document.getElementById("mp-prev")?.addEventListener("click", prevTrack);
    document.getElementById("mp-loop")?.addEventListener("click", () => {
        isLooping = !isLooping;
    });

    loadTrack(currentTrack);

    if (settings.autoplay) {
        setTimeout(() => playTrack(), 400);
    }

    setInterval(updateProgressBar, 300);
}

function loadTrack(i) {
    const track = playlist[i];
    const audio = document.getElementById("mp-audio");
    const scFrame = document.getElementById("mp-sc-frame");

    document.getElementById("mp-title").textContent = track.title;

    scMode = track.url.includes("soundcloud.com");

    if (scMode) {
        if (audio) {
            audio.pause();
            audio.style.display = "none";
        }

        scFrame.style.display = "block";
        scFrame.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(
            track.url
        )}&auto_play=false`;
    } else {
        scFrame.style.display = "none";
        audio.style.display = "block";

        audio.src = track.url;
        audio.volume = document.getElementById("mp-volume-slider").value;
    }
}

function playTrack() {
    const audio = document.getElementById("mp-audio");

    if (scMode) {
        const frame = document.getElementById("mp-sc-frame").contentWindow;
        frame.postMessage(JSON.stringify({ method: "play" }), "*");
    } else {
        audio.play();
    }

    document.getElementById("mp-play").textContent = "⏸";
}

function togglePlay() {
    const audio = document.getElementById("mp-audio");

    if (scMode) {
        const frame = document.getElementById("mp-sc-frame").contentWindow;
        frame.postMessage(JSON.stringify({ method: "toggle" }), "*");
        return;
    }

    if (audio.paused) {
        playTrack();
    } else {
        audio.pause();
        document.getElementById("mp-play").textContent = "▶";
    }
}

function nextTrack() {
    currentTrack = (currentTrack + 1) % playlist.length;
    loadTrack(currentTrack);
    playTrack();
}

function prevTrack() {
    currentTrack = (currentTrack - 1 + playlist.length) % playlist.length;
    loadTrack(currentTrack);
    playTrack();
}

function updateProgressBar() {
    const audio = document.getElementById("mp-audio");

    if (scMode) {
        const fill = document.getElementById("mp-progress-fill");
        fill.style.width = Math.random() * 100 + "%";
        return;
    }

    if (!audio.duration) return;

    const percent = (audio.currentTime / audio.duration) * 100;
    document.getElementById("mp-progress-fill").style.width = percent + "%";

    if (audio.ended) {
        if (isLooping) {
            playTrack();
        } else {
            nextTrack();
        }
    }
}

document.addEventListener("DOMContentLoaded", initChapterMusicPlayer);

/* -------------------------------------------------- */
/* EXPORT HELPERS                                     */
/* -------------------------------------------------- */

window.isChapterReleased = isChapterReleased;

/* -------------------------------------------------- */
/* MAGIC CURSOR + SPARKLE TRAIL                       */
/* -------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;

    if (
        !body.classList.contains("cursor-quill") &&
        !body.classList.contains("cursor-star")
    ) {
        return;
    }

    const cursor = document.createElement("div");
    cursor.classList.add("magic-cursor");

    if (body.classList.contains("cursor-quill")) {
        cursor.classList.add("quill");
    } else if (body.classList.contains("cursor-star")) {
        cursor.classList.add("star");
    }

    document.body.appendChild(cursor);

    let lastSparkleTime = 0;
    const sparkleInterval = 60;

    document.addEventListener("mousemove", e => {
        cursor.style.left = e.clientX + "px";
        cursor.style.top = e.clientY + "px";

        const now = Date.now();
        if (now - lastSparkleTime > sparkleInterval) {
            lastSparkleTime = now;
            createSparkle(e.clientX, e.clientY);
        }
    });
});

function createSparkle(x, y) {
    const s = document.createElement("div");
    s.classList.add("sparkle");
    s.style.left = x + "px";
    s.style.top = y + "px";

    document.body.appendChild(s);

    setTimeout(() => s.remove(), 600);
}

/* -------------------------------------------------- */
/* HTML ESCAPE HELPER                                 */
/* -------------------------------------------------- */

function escapeHTML(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}