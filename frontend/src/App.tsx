/** 应用路由表：全部页面挂在带导航头的 Layout 路由下。 */
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './AppLayout';
import Battle from './pages/Battle';
import Charts from './pages/Charts';
import Dashboard from './pages/Dashboard';
import Dictation from './pages/Dictation';
import Exam from './pages/Exam';
import Mistakes from './pages/Mistakes';
import Reading from './pages/Reading';
import ReadingArticle from './pages/ReadingArticle';
import Speaking from './pages/Speaking';
import Study from './pages/Study';
import Wordlist from './pages/Wordlist';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/study" element={<Study />} />
        <Route path="/dictation" element={<Dictation />} />
        <Route path="/battle" element={<Battle />} />
        <Route path="/exam" element={<Exam />} />
        <Route path="/speaking" element={<Speaking />} />
        <Route path="/stats" element={<Charts />} />
        <Route path="/reading" element={<Reading />} />
        <Route path="/reading/user/:id" element={<ReadingArticle />} />
        <Route path="/reading/:id" element={<ReadingArticle />} />
        <Route path="/wordlist" element={<Wordlist />} />
        <Route path="/mistakes" element={<Mistakes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}