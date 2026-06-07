import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 這裡的資料取自你的 Firebase 後台專案設定
const firebaseConfig = {
  apiKey: "AIzaSyDPXZ-3d0c7ISx554qvtOjz1doTOWlXG7I",
  authDomain: "fruit-684a9.firebaseapp.com",
  projectId: "fruit-684a9",
  storageBucket: "fruit-684a9.firebasestorage.app",
  messagingSenderId: "682345438546",
  appId: "1:682345438546:web:ec6ccd97c61248a195ee8b",
  measurementId: "G-Z7GYWHN5MM"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 初始化 Firestore 并導出，以便在其他檔案使用
export const db = getFirestore(app);
// ✅ Auth
export const auth = getAuth(app);

// ✅ 註冊
export const register = (email, password) =>
  createUserWithEmailAndPassword(auth, email, password);

// ✅ 登入
export const login = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

// ✅ 登出
export const logout = () => signOut(auth);

// ✅ 監聽登入狀態
export const onAuthChange = (callback) =>
  onAuthStateChanged(auth, callback);