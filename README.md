<h3 align="center">Higgsfield Launch Kit</h3>
<p align="center">A launch kit for a new product: one Shopify product in, a shot list from Claude, three Higgsfield stills that keep the real product, the best one animated, all in a Google Drive folder for review.<br />Built on <a href="https://withone.ai">One</a>. Nothing is published: a person reviews everything in Drive first.</p>

<p align="center">
  <a href="https://withone.ai"><strong>Website</strong></a>
  &nbsp;·&nbsp;
  <a href="https://withone.ai/docs"><strong>Docs</strong></a>
  &nbsp;·&nbsp;
  <a href="https://app.withone.ai"><strong>Dashboard</strong></a>
</p>

---

## Try it in five minutes, no keys

```bash
git clone https://github.com/withoneai/higgsfield-launch-kit
cd higgsfield-launch-kit
npm install
npm start
```

With no keys in the environment, the same pipeline runs against recorded data
for a fictional roaster's new espresso: a recorded Shopify read, a recorded
shot list and pick from Claude, and recorded Higgsfield generations (real image
and video files in `fixtures/media/`). Every recorded answer is labelled
`[fixture output]` in the log. Schema validation, the gates, the credit guard
and the run folder all work exactly as they do live. The run writes
everything to `out/<timestamp>-<product>/` and prints the Slack summary it
would have posted.

To see every One call the live run would make, with action ids and payloads,
without executing any of them:

```bash
npm start -- --dry-run
```

## What it does

1. **Reads the product from Shopify through One**: the id you pass, or the
   most recently created product. Title, description, featured image.
2. **Reads `brand.md`**, a plain-English brand brief: voice, colors, do and
   don't, where the assets will be used. The model reads it verbatim.
3. **Claude writes a shot list**: three stills (a studio shot, a lifestyle
   scene, a wide hero banner), each with a Higgsfield prompt, an aspect ratio
   chosen for where it will be used, and a model choice, plus one motion
   concept for the video. Structured output, validated in code.
4. **Higgsfield generates the three stills through One**, each one conditioned
   on the real product photo, so the bag in the picture is your bag and not
   the model's idea of one. Generation is async; the kit polls until each
   request is done.
5. **Claude looks at the three finished stills** against `brand.md` and picks
   the one to animate, with a written reason and a note on each. This is the
   decision that matters: it disqualifies anything with a warped label first,
   and it means you pay for one video, not three.
6. **Animates only the winner**: 5 seconds of image-to-video on Kling 2.5
   Turbo Standard. Before any generation the kit prints what it is about to
   spend and waits for a "y" (or `--yes`).
7. **Saves for review**: a new private Google Drive folder with the stills and
   the clip, and one Slack message with the shot list, the pick, the reason and
   the Drive links. If Slack is not connected, the message is printed instead.

## Go live (about 5 minutes)

**1. Connect the platforms through One**

```bash
npm i -g @withone/cli
one init                  # create an account or log in
one add shopify-admin     # read_products is all it needs
one add higgsfield-ai     # needs a Higgsfield Console API key (see below)
one add google-drive
one add slack             # optional
```

Higgsfield in One authenticates with **Higgsfield Console API credentials**:
create an API key at [console.higgsfield.ai](https://console.higgsfield.ai)
and paste its key ID and secret when `one add higgsfield-ai` asks. Generations
spend the credits on that account.

**2. Configure this repo**

```bash
cp .env.example .env
```

Fill in `ONE_SECRET`, `ANTHROPIC_API_KEY`, and the connection keys from
`one --agent list`. Each source is independent: leave one blank and that step
replays its recording, so you can go live one platform at a time. Drive and
Slack only receive real generations; a run on recorded stills never writes to
your accounts.

**3. Make the brief yours**

`brand.md` is the whole creative configuration. The shipped one is for a small
coffee roaster. Replace it with your brand: what you are, how you sound, your
colors, what you never want to see, and where these assets will be used (that
last part is what drives the aspect ratios).

**4. Check, then run**

```bash
npm run check                         # every probe is a read; nothing is generated or posted
npm start                             # newest product in the store
npm start -- --product 8841207193650  # a specific product (numeric id or gid://)
npm start -- --yes                    # skip the spend prompt (for cron or CI)
```

Without a terminal and without `--yes`, the kit stops before spending.

## What a run costs

One Shopify read, two Claude calls, three image generations, one 5-second
video, one Drive folder plus four uploads, one Slack message. The Higgsfield
generations are the only real spend, and the guard prints them before they
happen. Higgsfield prices depend on your plan, so the guard shows units (which
model, how many, how long) rather than guessing a dollar figure.

## The thing that is easy to get wrong

**Text-to-image will not give you your product.** Ask an image model for "a
kraft coffee bag with a copper hill logo" and you get a nice bag that is not
yours, with a label that almost spells your name. Every still here goes through
an image-conditioned model (Nano Banana with the product photo as an input
image, or Reve edit on the photo itself), and both the prompts and the judging
step treat a wrong label as disqualifying. Claude picks Reve when the product
photo's own framing is right and only the background and light need work, and
Nano Banana when the shot needs a new scene or a different aspect ratio.

## How it is wired

| File | What it does |
| --- | --- |
| `brand.md` | The brand brief, in plain English. The model reads it verbatim, twice |
| `src/shopify.ts` | Product read via One's raw passthrough on the Admin GraphQL API |
| `src/shotlist.ts` | Claude writes the shot list as structured output; a code gate checks it |
| `src/higgsfield.ts` | Submits the stills and the video, polls status, finds the output URL |
| `src/pick.ts` | Claude judges the finished stills with vision; the pick is gated in code |
| `src/guard.ts` | The credit guard: print the spend, then wait for `y` or `--yes` |
| `src/drive.ts` | Review folder and multipart uploads via One |
| `src/slack.ts` | The summary, via One's typed Slack action |
| `src/one.ts` | The single path every platform call takes: live, recorded, or dry run |
| `fixtures/` | The recorded responses and media the zero-key run replays |

The One actions it calls:

| Step | Platform | Action | Action id |
| --- | --- | --- | --- |
| newest product | `shopify-admin` | List Products | `conn_mod_def::GKbQiyxlSRc::ZTlGg0A_Q0q2nYOCUHqDYA` |
| product by id | `shopify-admin` | Get a Product by ID | `conn_mod_def::GKbQic6OiiY::Bne6ZnhjQBODqJfjhnqLJA` |
| still (new scene) | `higgsfield-ai` | Nano Banana Generation | `conn_mod_def::GLMJlkVhLik::ELbDTgsMRuC82s7SV_PI-Q` |
| still (edit photo) | `higgsfield-ai` | Edit Using Reve | `conn_mod_def::GLMJlsS1eJY::K98LQZWLSVWNBf_7f8iDRA` |
| video | `higgsfield-ai` | Image to Video Using Kling Video v2.5 Turbo Standard | `conn_mod_def::GLMJlP8QfFM::Cws4xxVyS8CgwkAGMbmuwA` |
| poll | `higgsfield-ai` | Get Generation Status | `conn_mod_def::GLMJljPc0Ck::kvGINkpWRMSU7aHg_Uy-AA` |
| folder, uploads | `google-drive` | Create a Drive File | `conn_mod_def::GJ6RzlNn1fs::1Qlp0KgqQbGF7WVXdC5wsw` |
| check | `google-drive` | List Files | `conn_mod_def::GJ6Rzy_a8J8::5DPVGp3fTXegRgMN4v11tA` |
| summary | `slack` | Send a Message to a Channel | `conn_mod_def::GJ7H84zBlaI::BCfuA16aTaGVIax5magsLA` |

Shopify and Higgsfield have no typed module in the One SDK yet, so they go
through `runRaw`, which still handles auth, the base URL, retries and parsing.
Slack uses the typed action.

**Two things to watch on your first live run.** One's docs for Get Generation
Status only document `{ id, status }`, so `outputUrls()` in
`src/higgsfield.ts` reads every likely shape for the finished media
(`images[].url`, `video.url`, a top-level `url`, and a few more) and fails
loudly with the raw response if it finds none. And One's docs leave the item
schema for Nano Banana's `input_images` unresolved; the kit sends
`{ "type": "image_url", "image_url": "<url>" }`. If either guess is wrong, the
error message will show you the real shape, and the fix is one line.

## License

MIT
