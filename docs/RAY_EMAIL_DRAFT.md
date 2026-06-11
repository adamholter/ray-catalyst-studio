# Draft Email To Ray

Subject: Catalyst Studio handoff

Hi Ray,

I got Catalyst Studio cleaned up and ready for your Claude agent to work with from GitHub. It includes the mockup, logo, editable mockup, and brand identity tools. I left the slide deck generator out for now because it needs more work before it is useful.

Before you hand this to Claude, grab your fal.ai API key and replace the bracketed placeholder in the prompt below.

Your Claude agent should start with this prompt:

```text
Clone https://github.com/adamholter/ray-catalyst-studio, read the README and repo docs, and follow the instructions there to get Catalyst Studio running locally. Start in mock mode first, then switch to live mode using this fal.ai key:

The API key to set up is [bracketed API key here].

Once it is running, give me the local URL and a short summary of what I need to know.
```

The repo also has the hosted deployment path documented now, so we can run the same app as a shared hosted version with durable storage instead of losing generated work when a local server restarts.

Thanks,
Adam
