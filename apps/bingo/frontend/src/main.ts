import { createApp, h } from "vue";
import { createRouter, createWebHistory, RouterView } from "vue-router";
import App from "./App.vue";
import "./style.css";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: App },
    { path: "/:code", component: App },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
createApp({ render: () => h(RouterView) })
  .use(router)
  .mount("#app");
