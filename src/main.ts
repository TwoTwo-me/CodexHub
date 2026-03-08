import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { ensurePwaShellRegistered } from './api/pwaGateway'
import './style.css'

createApp(App).use(router).mount('#app')
void ensurePwaShellRegistered()
