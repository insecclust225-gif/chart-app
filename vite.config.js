import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Path relatif supaya build bisa di-host di sub-folder (mis. GitHub Pages /chart-app/).
  base: './',
});
