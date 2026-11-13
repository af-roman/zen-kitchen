import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, PageHeader } from '@/shared/ui'

const sections = [
  { id: 'meals', title: 'Meals' },
  { id: 'cook', title: 'Cook evenings' },
  { id: 'variety', title: 'Variety' },
  { id: 'staple', title: 'Rice and noodles' },
  { id: 'planner', title: 'Plan my week' },
  { id: 'fill', title: 'After a cook' },
  { id: 'serve', title: 'Serving by hand' },
  { id: 'nutrition', title: 'Nutrition' },
  { id: 'defaults', title: 'Built-in numbers' },
] as const

export function GuidePage() {
  const navigate = useNavigate()
  return (
    <div>
      <PageHeader
        title="How it works"
        subtitle="How a week is chosen, and the numbers you don’t type."
        actions={
          <Button variant="secondary" onClick={() => navigate('/more')}>
            Back
          </Button>
        }
      />

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Sections">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-full bg-ink/5 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-ink/10"
          >
            {section.title}
          </a>
        ))}
      </nav>

      <div className="space-y-4">
        <Section id="meals" title="Meals">
          <p>
            A meal is a dish, chosen so the day lands near your calorie, protein, carb, and fat
            targets together. Breakfast is one dish and takes a smaller share of the day. Lunch is a
            center, plus a soup or a side when that moves the day closer. Dinner can take a soup and
            one side, and it stops at three dishes.
          </p>
          <p>
            A bowl that already includes rice or noodles does not get a second staple. A soup or
            salad is added beside a center only when it moves the day closer and calories stay under
            the cap. A missing soup is left empty. Another main is never stood in for it.
          </p>
          <p>
            Category tells the planner which job a recipe can do: staple, soup, side, or a center.
            Technique is how it is cooked. Effort is only for browsing. A prep recipe makes a pantry
            ingredient and is not placed on a plate.
          </p>
          <p>
            Each recipe says which meals it can be. A main, soup, side, or staple starts as lunch and
            dinner. A snack or dessert starts as breakfast and snack. Turn breakfast on for a dish you
            do eat in the morning, such as rice with egg. Curry stays off. The planner will not move
            a dish onto a meal it is not marked for. If nothing is marked for breakfast, that slot
            stays empty.
          </p>
        </Section>

        <Section id="cook" title="Cook evenings">
          <p>
            Before a plan is generated you choose the first day you want to eat, and the evenings you
            can cook. Those evenings are the only new cooks. If Sunday is not one of them, the plan
            does not invent a Sunday session.
          </p>
          <p>
            You cook in the evening, so the keep-by clock starts the next morning. A dish that keeps
            3 days, cooked Sunday evening, is eaten Monday, Tuesday, and Wednesday. Wednesday’s meals
            still come from Sunday. Wednesday evening can be the cook for Thursday, Friday, and
            Saturday.
          </p>
          <p>
            Each recipe has its own last day. A fish that keeps 2 days and a simmered dish that keeps
            3, cooked the same evening, do not cover the same meals. The shorter one drops off first.
          </p>
          <p>
            Days before the first cook’s food is ready are filled from what is already in the fridge,
            or left open. A cook date that is already past is dropped the next time you open the
            planner, and a fresh set of evenings is suggested. Change them before generating.
          </p>
          <p>
            Ingredients for a later cook have to keep raw from the first cook evening. A fish that
            keeps one day raw is left out of a cook three days later, and the plan says so.
          </p>
        </Section>

        <Section id="variety" title="Variety">
          <p>
            The planner cooks as few dishes as it can. One soup pot and one salad can sit on several
            meals. Rice can repeat. The same lunch or dinner center waits out the gap you set: the
            next day, after a day off, or after two days off. If holding that gap would mean cooking
            another dish, the center may repeat, and the plan says so.
          </p>
          <p>
            Lunch and dinner on the same day prefer different techniques, and the next day’s centers
            prefer a different technique from yesterday. Pan-fried, stir-fried, and deep-fried count
            as one fried family. A side in that same family is not added next to a fried center.
            Soups are exempt, so miso can sit beside a simmered fish. Assembled and Other do not
            count as a method, so set a real technique on the centers you cook.
          </p>
          <p>
            Turning on “use food that’s about to expire” prefers recipes that use those pantry items,
            as long as the cook evening is soon enough and the day stays inside the calorie cap.
          </p>
          <p>
            On the last keep day, a leftover dish (onigiri from yesterday’s chicken, and similar) can
            replace the center instead of repeating it. Put only the new ingredients on that recipe.
            The leftover itself is already in the cooked batch.
          </p>
        </Section>

        <Section id="staple" title="Rice and noodles">
          <p>
            Keep the rice or noodles in the recipe when the dish is a whole bowl. Mark it as a main
            or other center, and turn on <strong>This dish already includes a staple</strong>. Plain
            rice stays Staple, with the checkbox off. The checkbox is ignored on a dish whose
            category is already Staple.
          </p>
          <p>
            The planner adds a staple only beside a center that does not already include one, and
            only when the calories still have room. A donburi is not served with a second bowl of rice.
          </p>
        </Section>

        <Section id="planner" title="Plan my week">
          <p>
            Generate a plan after setting the dates. The draft shows the cook list, then one row per
            meal, then the day against your targets. Use this plan replaces meals in that range.
            Planned cooks from an earlier plan in the same stretch are removed. A cook already
            underway is left alone.
          </p>
          <p>
            The batch is the number of portions that will actually be eaten. Half portions are for
            rice, soup, and sides. A center stays a whole portion. If one portion is already over the
            day’s cap, the plan keeps the meal and marks the day.
          </p>
          <p>
            Breakfast takes a smaller share of the day than lunch or dinner. Soup and salad appear
            when they pull the day toward the four targets. If they would push it further away, the
            meal stays a single dish.
          </p>
        </Section>

        <Section id="fill" title="After a cook">
          <p>
            Filling the upcoming days starts the morning after the cook. Each lunch and dinner gets
            one center. Rice, and then a soup or a side, are added only beside a center that does not
            already include starch. Breakfast and snack stay a single dish, and only a recipe marked
            for that meal. Portions that do not fit stay in the batch. They are not piled onto dinner.
          </p>
          <p>Empty meal slots are filled. Meals that already have food are left alone.</p>
        </Section>

        <Section id="serve" title="Serving by hand">
          <p>
            The Serve editor does not rebuild the plan. It warns when a dish that already includes a
            staple shares the plate with a Staple dish. You can still save.
          </p>
        </Section>

        <Section id="nutrition" title="Nutrition">
          <p>
            A recipe’s calories are the sum of its ingredient lines, divided by its portions. The
            amount on the line is what leaves the pantry. Under the line, you can say how much of
            that is eaten. Nutrition uses that share. Shopping and the pantry still use the full
            amount.
          </p>
          <ul>
            <li>All of it is eaten: 100%.</li>
            <li>A coating is eaten: 25%. Marinade left on the food, panko that clings.</li>
            <li>A trace is eaten: 10%. Oil a deep-fry absorbs, a little of a steeped dashi solid.</li>
            <li>None of it is eaten: 0%. Kombu you lift out, flour left in the tray.</li>
          </ul>
          <p>
            The thin bar under a dish is carbs, then protein, then fat, sized by calories. Carbs and
            protein count as 4 kcal per gram, fat as 9. The thick bars use the dish’s stored energy,
            so they can disagree slightly with the thin bar.
          </p>
          <p>
            Goal rings compare a day with your daily targets. The default targets are 2,000 kcal,
            40% carbs, 30% protein, 30% fat. Gram targets are those calories times the percentage,
            divided by 4 for carbs and protein and by 9 for fat. The planner picks each dish to move
            the day closer to all four at once. A day more than 15% off any of them is marked.
            Calories are also a ceiling: soup, sides, and rice are dropped before a day goes more
            than that far over the calorie goal. You can set that band from 5% to 40%.
          </p>
        </Section>

        <Section id="defaults" title="Built-in numbers">
          <ul>
            <li>A new plan starts tomorrow, covers 7 days, and fills lunch and dinner.</li>
            <li>
              Cook evenings are suggested every 3 eat days, beginning the evening before the first
              meal. A Monday start suggests Sunday, Wednesday, and Saturday.
            </li>
            <li>The same main waits a day before it repeats. You can allow the next day, or wait two.</li>
            <li>Food that expires within 5 days is preferred when that switch is on. It is on by default.</li>
            <li>A day is marked when any target is more than 15% off. Soup, sides, and rice are dropped before calories go more than that far over. You can set the band from 5% to 40%.</li>
            <li>
              Keep-by for planning is the fridge days on the recipe. If those are missing, it uses
              the first storage option, then 3 days. The cook evening itself is not an eat day.
            </li>
            <li>
              Photos you upload are resized to JPEG. The dish photo is at most 640 pixels wide. A
              step photo is at most 960.
            </li>
            <li>
              An empty kitchen loads the starter recipes once. Loading starters later adds a recipe
              only when that name is not already there. A recipe you already edited keeps its name
              and is not replaced.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  )
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="card-elevated scroll-mt-4 px-4 py-4">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-muted [&_li]:mt-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  )
}
