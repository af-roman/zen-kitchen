import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { routerBasename } from '@/shared/assetUrl'
import { DialogProvider } from '@/shared/dialog'
import { SyncProvider } from '@/sync/SyncProvider'
import { Bootstrap } from './app/Bootstrap'
import { AppShell } from './app/AppShell'
import { PlanPage } from './features/plan/PlanPage'
import { TodayPage } from './features/plan/TodayPage'
import { DayDetailPage } from './features/plan/DayDetailPage'
import { ServePage } from './features/plan/ServePage'
import { WeekPlannerPage } from './features/plan/WeekPlannerPage'
import { ReadyPage } from './features/ready/ReadyPage'
import { RecipesPage } from './features/recipes/RecipesPage'
import { RecipeDetailPage } from './features/recipes/RecipeDetailPage'
import { RecipeEditPage } from './features/recipes/RecipeEditPage'
import { PantryPage } from './features/pantry/PantryPage'
import { MorePage } from './features/more/MorePage'
import { IngredientsPage } from './features/ingredients/IngredientsPage'
import { ShoppingPage } from './features/shopping/ShoppingPage'
import { GoalsPage } from './features/goals/GoalsPage'
import { BackupPage } from './features/backup/BackupPage'
import { NotebookPage } from './features/notebook/NotebookPage'
import { SessionPlanPage } from './features/cook/SessionPlanPage'
import { CookPage } from './features/cook/CookPage'

export default function App() {
  return (
    <DialogProvider>
      <Bootstrap>
        <SyncProvider>
          <BrowserRouter basename={routerBasename()}>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<TodayPage />} />
                <Route path="week" element={<PlanPage />} />
                <Route path="plan/:date" element={<DayDetailPage />} />
                <Route path="serve" element={<ServePage />} />
                <Route path="plan-week" element={<WeekPlannerPage />} />
                <Route path="ready" element={<ReadyPage />} />
                <Route path="recipes/new" element={<RecipeEditPage />} />
                <Route path="recipes/:id/edit" element={<RecipeEditPage />} />
                <Route path="recipes/:id" element={<RecipeDetailPage />} />
                <Route path="recipes" element={<RecipesPage />} />
                <Route path="pantry" element={<PantryPage />} />
                <Route path="more" element={<MorePage />} />
                <Route path="ingredients" element={<IngredientsPage />} />
                <Route path="shopping" element={<ShoppingPage />} />
                <Route path="log" element={<Navigate to="/notebook" replace />} />
                <Route path="goals" element={<GoalsPage />} />
                <Route path="backup" element={<BackupPage />} />
                <Route path="notebook" element={<NotebookPage />} />
                <Route path="sessions/new" element={<SessionPlanPage />} />
                <Route path="cook/:id" element={<CookPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </SyncProvider>
      </Bootstrap>
    </DialogProvider>
  )
}
