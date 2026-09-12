import { bootHost } from './boot'

function boot(): void {
  void bootHost(__MMD_HUD_BUILD_ID__)
}

if (document.body) boot()
else document.addEventListener('DOMContentLoaded', boot, { once: true })
