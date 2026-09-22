import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161/build/three.module.js';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.161/examples/jsm/loaders/GLTFLoader.js';
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,1000);
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#game'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
scene.add(new THREE.HemisphereLight(0xffffff,0x444444,2));
const loader=new GLTFLoader();
loader.load('assets/free_fire_clocktower_3d_model_by_ffxn.glb',g=>scene.add(g.scene));
loader.load('assets/naruto_free_fire.glb',g=>{g.scene.position.y=2;scene.add(g.scene);document.querySelector('#loading').style.display='none'});
camera.position.set(0,5,8);
function loop(){requestAnimationFrame(loop);renderer.render(scene,camera)}loop();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)})
