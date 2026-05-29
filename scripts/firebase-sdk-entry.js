/**
 * Entry for bundling Firebase compat (global `firebase`) for use with a plain <script> tag.
 * Build: npm run build:firebase
 */
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';

window.firebase = firebase;
