/* global document, window, IntersectionObserver */
const reveals=document.querySelectorAll('.reveal');
if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.12});reveals.forEach(node=>observer.observe(node))}else reveals.forEach(node=>node.classList.add('visible'));
document.querySelectorAll('details').forEach(detail=>detail.addEventListener('toggle',()=>{if(detail.open)document.querySelectorAll('details[open]').forEach(other=>{if(other!==detail)other.open=false})}));
