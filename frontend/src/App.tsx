import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import StudentPage from './pages/StudentPage';
import TeacherPage from './pages/TeacherPage';
import TeacherGate from './components/TeacherGate';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/lab" element={<StudentPage />} />
      <Route path="/teacher" element={<TeacherGate><TeacherPage /></TeacherGate>} />
    </Routes>
  );
}
