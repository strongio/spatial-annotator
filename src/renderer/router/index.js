import Vue from 'vue';
import Router from 'vue-router';

Vue.use(Router);

export default new Router({
  routes: [
    {
      path: '/',
      name: 'annotator',
      component: require('@/components/Annotator.vue').default,
    },
    {
      path: '*',
      redirect: '/',
    },
  ],
});
