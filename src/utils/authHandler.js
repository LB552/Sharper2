import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
} from "firebase/auth";

import {
    doc,
    setDoc,
    serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../firebase.js";

// Log in an existing user.
export async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
}

// Register a new user.
export async function register(email, password, username) {
    const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
    );

    const user = credential.user;

    await setDoc(doc(db, "users", user.uid), {
        createdAt: serverTimestamp(),
        email: user.email,
        uid: user.uid,
        username: username,
        usernameLower: username.toLowerCase(),
    });

    return credential;
}

// Log out the current user.
export async function logout() {
    await signOut(auth);
}