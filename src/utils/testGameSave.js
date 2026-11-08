import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export async function saveTest() {
  if (!auth.currentUser) {
    throw new Error('No user is logged in!');
  }

  const uid = auth.currentUser.uid;

  const gameSaveRef = doc(db, 'gameSaves', uid);

  await setDoc(gameSaveRef, {
    games: {
      memory: {
        level: 3
      }
    },
  }, { merge: true });

  console.log('Game save successful!');
}